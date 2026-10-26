import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Turns teacher-uploaded material into sections with human-readable refs
 * ("p. 3", "§ Factoring") that the tutor cites back to students.
 */

export interface Section {
  ref: string;
  text: string;
}

export class ExtractionError extends Error {}

/** Collapse runs of spaces but keep paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdf(bytes: Uint8Array): Promise<Section[]> {
  let pages: string[];
  try {
    // pdf.js transfers (detaches) the buffer it's given; parse a copy so the
    // caller can still upload the original bytes.
    const pdf = await getDocumentProxy(bytes.slice());
    ({ text: pages } = await extractText(pdf, { mergePages: false }));
  } catch {
    throw new ExtractionError("That file doesn't look like a valid PDF.");
  }
  const sections = pages
    .map((text, i) => ({ ref: `p. ${i + 1}`, text: normalizeText(text) }))
    .filter((s) => s.text.length > 0);
  if (sections.length === 0) {
    throw new ExtractionError(
      "No text found in this PDF. It may be a scan; try a text-based PDF or paste the text instead.",
    );
  }
  return sections;
}

export async function extractDocx(bytes: Uint8Array): Promise<Section[]> {
  let html: string;
  try {
    ({ value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }));
  } catch {
    throw new ExtractionError("That file doesn't look like a valid Word (.docx) document.");
  }
  return extractHtml(html);
}

const BLOCK_SELECTOR = "h1, h2, h3, h4, p, li, pre, blockquote, td, th, figcaption, dt, dd";
const NOISE_SELECTOR = "script, style, noscript, svg, nav, header, footer, aside, form, iframe, template";

/** Sections split at h1–h3; each heading becomes the ref ("§ Heading"). */
export function extractHtml(html: string): Section[] {
  const $ = cheerio.load(html);
  $(NOISE_SELECTOR).remove();
  const root = $("main").first().length ? $("main").first() : $("article").first().length ? $("article").first() : $("body");

  const sections: Section[] = [];
  let current: { ref: string; parts: string[] } = { ref: "Introduction", parts: [] };
  const flush = () => {
    const text = normalizeText(current.parts.join("\n\n"));
    if (text) sections.push({ ref: current.ref, text });
  };

  root.find(BLOCK_SELECTOR).each((_, el) => {
    // Skip blocks nested in another block we already take (e.g. <p> inside <li>).
    if ($(el).parents(BLOCK_SELECTOR).length > 0) return;
    const text = normalizeText($(el).text());
    if (!text) return;
    if (/^h[1-3]$/i.test($(el).prop("tagName") ?? "")) {
      flush();
      current = { ref: `§ ${truncate(text, 60)}`, parts: [] };
    } else {
      current.parts.push(text);
    }
  });
  flush();

  if (sections.length === 0) {
    const fallback = normalizeText(root.text());
    if (fallback) return [{ ref: "Full text", text: fallback }];
    throw new ExtractionError("No readable text found.");
  }
  return sections;
}

export function htmlTitle(html: string): string | null {
  const title = normalizeText(cheerio.load(html)("title").first().text());
  return title || null;
}

/** Pasted or .txt text. Markdown headings (#, ##, ###) start new sections. */
export function extractPlainText(text: string): Section[] {
  const sections: Section[] = [];
  let current: { ref: string; lines: string[] } = { ref: "Text", lines: [] };
  const flush = () => {
    const body = normalizeText(current.lines.join("\n"));
    if (body) sections.push({ ref: current.ref, text: body });
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (heading) {
      flush();
      current = { ref: `§ ${truncate(heading[1]!.trim(), 60)}`, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  if (sections.length === 0) throw new ExtractionError("There's no text to add.");
  return sections;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
