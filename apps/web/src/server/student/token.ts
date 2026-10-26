import { createHmac } from "node:crypto";
import { decodeSessionToken, encodeSessionToken } from "../session-token";

/**
 * Student tokens (sent by the extension as `Authorization: Bearer …`) use the
 * same format as teacher sessions but a key derived for students only, so a
 * teacher cookie can't be replayed as a student token or vice versa.
 */

export const STUDENT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function studentKey(secret: string): string {
  return createHmac("sha256", secret).update("asterisk:student-token:v1").digest("base64url");
}

export function issueStudentToken(studentId: string, secret: string, nowMs = Date.now()): string {
  return encodeSessionToken(studentId, nowMs + STUDENT_TOKEN_TTL_MS, studentKey(secret));
}

export function verifyStudentToken(token: string, secret: string, nowMs = Date.now()): string | null {
  return decodeSessionToken(token, studentKey(secret), nowMs);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1]! : null;
}
