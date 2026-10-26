"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, getOrCreateDemoTeacher, startSession, teacherPasscode } from "@/server/auth";
import { passcodeMatches } from "@/server/session-token";

export interface LoginState {
  error?: string;
}

const LoginInput = z.object({ passcode: z.string().min(1).max(200) });

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginInput.safeParse({ passcode: formData.get("passcode") });
  if (!parsed.success || !passcodeMatches(parsed.data.passcode, teacherPasscode())) {
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
