import { passcodeMatches } from "./session-token";

/**
 * Who may use a hosted copy of Asterisk. Every AI call costs real money, and
 * the demo join code (QUAD24) is printed in the public README, so a deployed
 * site needs more than a join code:
 * - STUDENT_ACCESS_KEY: students must also enter this key to join. Locally it
 *   is optional; in production joining is closed until it is set.
 * - TEACHER_PASSCODE: in production it must be at least MIN_SECRET_LENGTH long.
 * Pure functions over `env` so they can be tested without a server.
 */

type Env = Record<string, string | undefined>;

export const MIN_SECRET_LENGTH = 16;

const isProduction = (env: Env) => env.NODE_ENV === "production";

export type StudentAccess = "open" | "ok" | "missing" | "wrong" | "closed";

export function checkStudentAccess(input: string | undefined, env: Env = process.env): StudentAccess {
  const key = env.STUDENT_ACCESS_KEY?.trim();
  if (!key) return isProduction(env) ? "closed" : "open";
  if (isProduction(env) && key.length < MIN_SECRET_LENGTH) return "closed";
  if (!input) return "missing";
  return passcodeMatches(input, key) ? "ok" : "wrong";
}

/** The teacher passcode, or null when it is unset or too short for a production site. */
export function usableTeacherPasscode(env: Env = process.env): string | null {
  const passcode = env.TEACHER_PASSCODE;
  if (!passcode) return null;
  if (isProduction(env) && passcode.length < MIN_SECRET_LENGTH) return null;
  return passcode;
}
