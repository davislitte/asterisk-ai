import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Demo-grade teacher session: `<teacherId>.<expiresAtMs>.<hmac>` in an
 * httpOnly cookie, signed with SESSION_SECRET. Pure functions so they can be
 * unit-tested without Next.js.
 */

export function encodeSessionToken(teacherId: string, expiresAtMs: number, secret: string): string {
  const payload = `${teacherId}.${expiresAtMs}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [teacherId, expires, signature] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${teacherId}.${expires}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const expiresAtMs = Number(expires);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  return teacherId;
}

/** Constant-time passcode comparison (hashing first equalizes lengths). */
export function passcodeMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
