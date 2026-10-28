import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assignments } from "@/db/schema";

/**
 * Teacher-only answer keys, loaded solely to feed the server-side answer-leak
 * check. Never include the result (or anything derived from it, such as a
 * leak verdict's reason) in a student response.
 */
export async function getAnswerKeysForLeakCheck(
  classId: string,
  assignmentId: string,
): Promise<Record<string, string | undefined>> {
  const row = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)),
    columns: { problems: true },
  });
  return Object.fromEntries((row?.problems ?? []).map((p) => [p.id, p.answerKey]));
}
