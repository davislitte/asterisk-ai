/**
 * Per-student limits on the paid AI routes. Counts come from the rows those
 * routes store (chat messages, rubric checks), so limits hold across server
 * instances. The daily spending cap is the hard backstop behind these.
 */

export interface Window {
  /** Max requests in the window. */
  max: number;
  /** Window length in seconds. */
  seconds: number;
  /** Shown to the student when they hit it. */
  message: string;
}

export const CHAT_LIMITS: Window[] = [
  { max: 8, seconds: 60, message: "You're sending messages quickly. Take a moment to try the step, then ask again in a minute." },
  { max: 150, seconds: 86_400, message: "You've reached today's message limit with Asterisk. Ask your teacher, or keep going tomorrow." },
];

export const RUBRIC_CHECK_LIMITS: Window[] = [
  { max: 6, seconds: 3_600, message: "You've checked your work a lot this hour. Make some changes, then check again later." },
  { max: 20, seconds: 86_400, message: "You've reached today's limit for rubric checks." },
];

export const PHOTO_LIMITS: Window[] = [
  { max: 6, seconds: 3_600, message: "You've sent a lot of photos this hour. Work on the feedback, then try again later." },
  { max: 20, seconds: 86_400, message: "You've reached today's limit for photo feedback." },
];

/** Returns the first limit exceeded given each window's current count, or null. */
export function exceededLimit(limits: Window[], counts: number[]): Window | null {
  return limits.find((limit, i) => (counts[i] ?? 0) >= limit.max) ?? null;
}

/**
 * One AI request per student per route at a time, so a burst of parallel
 * requests can't slip past the counts before any row is written. Per server
 * instance; the DB counts and the spending cap cover the rest.
 */
export class InFlight {
  private readonly keys = new Set<string>();

  acquire(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  release(key: string): void {
    this.keys.delete(key);
  }
}

export const inFlight = new InFlight();

export const BUSY_MESSAGE = "Asterisk is still working on your last request. Wait for it to finish, then try again.";
