import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, rubricChecks } from "@/db/schema";
import { CHAT_LIMITS, RUBRIC_CHECK_LIMITS, type Window, exceededLimit } from "./rate-limits";

const since = (seconds: number) => new Date(Date.now() - seconds * 1000);

/** The message to show if the student is over a chat limit, or null. */
export async function chatLimitMessage(studentId: string): Promise<string | null> {
  const counts = await Promise.all(
    CHAT_LIMITS.map(async (w: Window) => {
      const [row] = await db
        .select({ n: count() })
        .from(chatMessages)
        .where(and(eq(chatMessages.studentId, studentId), eq(chatMessages.role, "student"), gte(chatMessages.createdAt, since(w.seconds))));
      return row?.n ?? 0;
    }),
  );
  return exceededLimit(CHAT_LIMITS, counts)?.message ?? null;
}

/** The message to show if the student is over a rubric-check limit, or null. */
export async function rubricCheckLimitMessage(studentId: string): Promise<string | null> {
  const counts = await Promise.all(
    RUBRIC_CHECK_LIMITS.map(async (w: Window) => {
      const [row] = await db
        .select({ n: count() })
        .from(rubricChecks)
        .where(and(eq(rubricChecks.studentId, studentId), gte(rubricChecks.createdAt, since(w.seconds))));
      return row?.n ?? 0;
    }),
  );
  return exceededLimit(RUBRIC_CHECK_LIMITS, counts)?.message ?? null;
}
