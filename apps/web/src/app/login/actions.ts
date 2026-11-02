"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { MIN_SECRET_LENGTH, usableTeacherPasscode } from "@/server/access";
import { endSession, getOrCreateDemoTeacher, startSession } from "@/server/auth";
import { passcodeMatches } from "@/server/session-token";

export interface LoginState {
  error?: string;
}

const LoginInput = z.object({ passcode: z.string().min(1).max(200) });

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const expected = usableTeacherPasscode();
  if (!expected) {
    console.warn(`[login] refused: set TEACHER_PASSCODE (${MIN_SECRET_LENGTH}+ characters on a production site)`);
    return { error: "Sign-in is closed on this site." };
  }
  const parsed = LoginInput.safeParse({ passcode: formData.get("passcode") });
  if (!parsed.success || !passcodeMatches(parsed.data.passcode, expected)) {
    // Slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "That passcode isn't right." };
  }
  const teacher = await getOrCreateDemoTeacher();
  await startSession(teacher.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
