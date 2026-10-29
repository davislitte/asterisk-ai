import "server-only";
import { PhotoFeedbackResult } from "@asterisk/shared";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workPhotos } from "@/db/schema";

type Row = typeof workPhotos.$inferSelect;

/** Student-safe view of a stored photo: what was read and the feedback, never the guard details. */
export function toPhotoFeedbackResult(row: Pick<Row, "id" | "createdAt" | "legible" | "problems" | "overall">) {
  const parsed = PhotoFeedbackResult.safeParse({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    legible: row.legible,
    problems: row.problems,
    overall: row.overall,
  });
  return parsed.success ? parsed.data : null;
}

export async function getLatestPhoto(studentId: string, assignmentId: string) {
  const row = await db.query.workPhotos.findFirst({
    where: and(eq(workPhotos.studentId, studentId), eq(workPhotos.assignmentId, assignmentId)),
    orderBy: desc(workPhotos.createdAt),
  });
  return row ? toPhotoFeedbackResult(row) : null;
}
