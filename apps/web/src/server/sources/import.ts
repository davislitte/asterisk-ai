import type { SourceKind } from "@asterisk/shared";
import { type Section, ExtractionError, extractDocx, extractHtml, extractPdf, extractPlainText, htmlTitle } from "./extract";
import { UrlFetchError, fetchPublicUrl, googleDocExportUrl } from "./fetch-url";

/** Everything needed to store one source: what it is, where it came from, and its sections. */
export interface ImportedSource {
  kind: SourceKind;
  title: string;
  url?: string;
  sections: Section[];
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function fileKind(name: string, mime: string): "pdf" | "docx" | "text" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx" || mime === DOCX_MIME) return "docx";
  if (["txt", "md", "markdown"].includes(ext) || mime.startsWith("text/plain") || mime === "text/markdown") return "text";
  return null;
}

export async function importFile(name: string, mime: string, bytes: Uint8Array): Promise<ImportedSource> {
  if (bytes.byteLength === 0) throw new ExtractionError("That file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ExtractionError("Files must be 4 MB or smaller.");

  const kind = fileKind(name, mime);
  const title = name.replace(/\.[^.]+$/, "") || name;
  switch (kind) {
    case "pdf":
      return { kind, title, sections: await extractPdf(bytes) };
    case "docx":
      return { kind, title, sections: await extractDocx(bytes) };
    case "text":
      return { kind, title, sections: extractPlainText(new TextDecoder().decode(bytes)) };
    default:
      throw new ExtractionError("Upload a PDF, Word (.docx) or plain-text file.");
  }
}

export function importPastedText(title: string, text: string): ImportedSource {
  return { kind: "text", title, sections: extractPlainText(text) };
}

export async function importUrl(rawUrl: string): Promise<ImportedSource> {
  const exportUrl = googleDocExportUrl(rawUrl);
  let doc;
  try {
    doc = await fetchPublicUrl(exportUrl ?? rawUrl);
  } catch (err) {
    if (exportUrl && err instanceof UrlFetchError) {
      throw new UrlFetchError(
        "Couldn't read that Google Doc. Share it as \"Anyone with the link can view\", or download it as .docx and upload it.",
      );
    }
    throw err;
  }

  const host = new URL(rawUrl).hostname;
  const text = () => new TextDecoder().decode(doc.body);

  if (exportUrl) {
    return { kind: "url", title: `Google Doc (${host})`, url: rawUrl, sections: extractPlainText(text()) };
  }
  if (doc.contentType === "application/pdf") {
    return { kind: "url", title: host, url: rawUrl, sections: await extractPdf(doc.body) };
  }
  if (doc.contentType === "text/plain" || doc.contentType === "text/markdown") {
    return { kind: "url", title: host, url: rawUrl, sections: extractPlainText(text()) };
  }
  if (doc.contentType === "text/html" || doc.contentType === "application/xhtml+xml") {
    const html = text();
    return { kind: "url", title: htmlTitle(html) ?? host, url: rawUrl, sections: extractHtml(html) };
  }
  throw new UrlFetchError(`Can't import that kind of page (${doc.contentType || "unknown type"}).`);
}
