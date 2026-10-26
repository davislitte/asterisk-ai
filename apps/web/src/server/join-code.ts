import { randomInt } from "node:crypto";

// No 0/O or 1/I, so codes read cleanly off a projector.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(): string {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** Postgres unique_violation, unwrapped from Drizzle's query error if needed. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(err) === "23505" || code((err as { cause?: unknown } | null)?.cause) === "23505";
}

/** Runs `insert` with fresh codes until one doesn't collide. */
export async function withUniqueJoinCode<T>(insert: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await insert(generateJoinCode());
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Couldn't generate a unique join code. Try again.");
}
