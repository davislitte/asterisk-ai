/**
 * Deterministic backstop for the jailbreak flag: prompt-injection shapes that
 * should always reach the teacher's monitor, whatever the classifier says.
 * Kept narrow on purpose; the model classifier handles everything subtler.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Closing or opening a prompt tag: "</message>", "<system>"
  /<\/?\s*(message|student_message|student_draft|draft_reply|system|developer|instructions|assistant)\b/i,
  // A line posing as another speaker: "SYSTEM: ...", "Developer: ..."
  /^\s*\[?(system|developer|assistant)\]?\s*:/im,
  // "ignore your instructions", "disregard all previous rules" (not "I forget the rules for signs")
  /\b(ignore|disregard|override)\s+(all\s+)?(of\s+)?(your|previous|prior|above|earlier|all)\b[^.\n]{0,20}\b(instructions|rules|prompt|guidelines|programming)\b/i,
  // "developer mode", "answer-reveal mode", "DAN mode", "jailbreak"
  /\b(developer|dev|admin|god|dan|debug|unrestricted|answer[- ]reveal)\s+mode\b/i,
  /\bjailbreak\b/i,
  // Asking for the hidden prompt
  /\b(system|hidden|secret)\s+prompt\b/i,
];

export function looksLikeInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(message));
}
