import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { teachers } from "@/db/schema";
import { decodeSessionToken, encodeSessionToken } from "./session-token";

const COOKIE_NAME = "asterisk_teacher";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Teacher {
  id: string;
  displayName: string;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to 32+ random characters (see .env.example).");
  }
  return secret;
}

export function teacherPasscode(): string {
  const passcode = process.env.TEACHER_PASSCODE;
  if (!passcode) throw new Error("TEACHER_PASSCODE is not set (see .env.example).");
  return passcode;
}

/** The signed-in teacher, or null. Re-verified on every call; never trusts the client. */
export async function getTeacher(): Promise<Teacher | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const teacherId = decodeSessionToken(token, sessionSecret());
  if (!teacherId) return null;
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.id, teacherId),
    columns: { id: true, displayName: true },
  });
  return teacher ?? null;
}

/** Use at the top of every dashboard page and teacher server action. */
export async function requireTeacher(): Promise<Teacher> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/login");
  return teacher;
}

export async function startSession(teacherId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  (await cookies()).set(COOKIE_NAME, encodeSessionToken(teacherId, expiresAt, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Demo-grade auth: one passcode, one teacher (the seeded one, or a fresh one). */
export async function getOrCreateDemoTeacher(): Promise<Teacher> {
  const existing = await db.query.teachers.findFirst({
    orderBy: asc(teachers.createdAt),
    columns: { id: true, displayName: true },
  });
  if (existing) return existing;
  const [created] = await db
    .insert(teachers)
    .values({ displayName: "Teacher" })
    .returning({ id: teachers.id, displayName: teachers.displayName });
  return created!;
}
