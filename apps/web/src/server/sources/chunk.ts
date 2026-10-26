import type { Section } from "./extract";

export interface Chunk {
  ref: string;
  text: string;
}

/** Sources go to Muse Spark in full (1M-token context); chunks exist so answers can cite a precise spot. */
export const MAX_CHUNK_CHARS = 1500;

/**
 * Splits long sections into chunks of at most `maxChars`, breaking at
 * paragraphs, then sentences, then hard limits. Refs gain "(part k/n)".
 */
export function chunkSections(sections: Section[], maxChars = MAX_CHUNK_CHARS): Chunk[] {
  return sections.flatMap((section) => {
    const pieces = splitText(section.text, maxChars);
    if (pieces.length === 1) return [{ ref: section.ref, text: pieces[0]! }];
    return pieces.map((text, i) => ({ ref: `${section.ref} (part ${i + 1}/${pieces.length})`, text }));
  });
}

function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const units = text
    .split(/\n{2,}/)
    .flatMap((para) => (para.length <= maxChars ? [para] : splitSentences(para, maxChars)));

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    const joined = current ? `${current}\n\n${unit}` : unit;
    if (joined.length <= maxChars) {
      current = joined;
    } else {
      if (current) chunks.push(current);
      current = unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitSentences(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [paragraph];
  return sentences.flatMap((s) => {
    const trimmed = s.trim();
    if (trimmed.length <= maxChars) return [trimmed];
    const parts: string[] = [];
    for (let i = 0; i < trimmed.length; i += maxChars) parts.push(trimmed.slice(i, i + maxChars));
    return parts;
  });
}

/** Rough token estimate (≈4 chars/token) for the context-budget display. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
