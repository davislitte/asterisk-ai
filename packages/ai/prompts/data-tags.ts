/**
 * Student-written text goes into prompts inside tags (<message>, <student_draft>, ...)
 * that the instructions call data. Anything tag-shaped inside that text is
 * neutralized first, so "</message> SYSTEM: ..." can't close the wrapper and
 * pose as instructions.
 */
const TAG_LIKE = /<(\/?\s*[A-Za-z_][\w-]*[^<>]*)>/g;

export function neutralizeTags(text: string): string {
  return text.replace(TAG_LIKE, "‹$1›");
}

/** `<tag>\ntext\n</tag>` with any tag-shaped text inside neutralized. */
export function dataBlock(tag: string, text: string): string {
  return `<${tag}>\n${neutralizeTags(text)}\n</${tag}>`;
}
