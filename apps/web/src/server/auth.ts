import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { teachers } from "@/db/schema";
import { decodeSessionToken, encodeSessionToken, guestSessionSecret } from "./session-token";

const COOKIE_NAME = "asterisk_teacher";
const GUEST_COOKIE_NAME = "asterisk_guest";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface Teacher {
  id: string;
  displayName: string;
  /** A read-only guest: can view pages, but requireTeacher() refuses every action. */
  guest: boolean;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to 32+ random characters (see .env.example).");
  }
  return secret;
}

/** The signed-in teacher or guest, or null. Re-verified on every call; never trusts the client. */
export async function getTeacher(): Promise<Teacher | null> {
  const jar = await cookies();
  const secret = sessionSecret();
  const token = jar.get(COOKIE_NAME)?.value;
  const teacherId = token ? decodeSessionToken(token, secret) : null;
  const guestToken = teacherId ? undefined : jar.get(GUEST_COOKIE_NAME)?.value;
  const guestOfId = guestToken ? decodeSessionToken(guestToken, guestSessionSecret(secret)) : null;
  const id = teacherId ?? guestOfId;
  if (!id) return null;
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.id, id),
    columns: { id: true, displayName: true },
  });
  if (!teacher) return null;
  return teacherId ? { ...teacher, guest: false } : { ...teacher, displayName: "Guest", guest: true };
}

/** Use at the top of dashboard pages that are safe to show a read-only guest. */
export async function requireViewer(): Promise<Teacher> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/login");
  return teacher;
}

/** Use at the top of every teacher server action, and any page a guest shouldn't see. Refuses guests. */
export async function requireTeacher(): Promise<Teacher> {
  const teacher = await requireViewer();
  if (teacher.guest) redirect("/");
  return teacher;
}

async function setSessionCookie(name: string, token: string, expiresAt: number): Promise<void> {
  (await cookies()).set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function startSession(teacherId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await setSessionCookie(COOKIE_NAME, encodeSessionToken(teacherId, expiresAt, sessionSecret()), expiresAt);
}

/** Read-only view of the demo teacher's classes, for anyone. No passcode. */
export async function startGuestSession(teacherId: string): Promise<void> {
  const expiresAt = Date.now() + GUEST_SESSION_TTL_MS;
  const token = encodeSessionToken(teacherId, expiresAt, guestSessionSecret(sessionSecret()));
  await setSessionCookie(GUEST_COOKIE_NAME, token, expiresAt);
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  jar.delete(GUEST_COOKIE_NAME);
}

/** Demo-grade auth: one passcode, one teacher (the seeded one, or a fresh one). */
export async function getOrCreateDemoTeacher(): Promise<Pick<Teacher, "id" | "displayName">> {
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
