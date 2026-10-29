import "server-only";
import { ModelCallError, STUDENT_SAFE_ERROR_MESSAGE } from "@asterisk/ai";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { students } from "@/db/schema";
import { studentJson } from "../student-response";
import { bearerToken, verifyStudentToken } from "./token";

export interface Student {
  id: string;
  classId: string;
  displayName: string;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to 32+ random characters.");
  return secret;
}

/** Resolves the student from the request's Bearer token, re-checked against the DB. */
export async function getStudent(request: Request): Promise<Student | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const studentId = verifyStudentToken(token, sessionSecret());
  if (!studentId) return null;
  const student = await db.query.students.findFirst({
    where: eq(students.id, studentId),
    columns: { id: true, classId: true, displayName: true },
  });
  return student ?? null;
}

export const unauthorized = () =>
  studentJson({ error: "Please join your class again." }, { status: 401 });

export const badRequest = (error: string) => studentJson({ error }, { status: 400 });

export const notFound = (what = "That assignment") =>
  studentJson({ error: `${what} isn't available.` }, { status: 404 });

export const tooManyRequests = (error: string) => studentJson({ error }, { status: 429 });

/**
 * A model call failed: tell the student plainly if the daily spending cap
 * stopped it (429), otherwise the generic retry message (503). Never raw errors.
 */
export function aiUnavailable(err: unknown, where: string) {
  if (err instanceof ModelCallError) {
    if (err.spendCapReached) return tooManyRequests(err.userMessage);
  } else {
    console.error(`[${where}] failed`, err);
  }
  return studentJson({ error: STUDENT_SAFE_ERROR_MESSAGE }, { status: 503 });
}
