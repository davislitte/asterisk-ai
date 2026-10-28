import "server-only";
import { RubricCheckResult, type StudentRubricCriterion } from "@asterisk/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { rubricChecks, rubricCriteria, rubrics } from "@/db/schema";

/** Shape stored in rubric_checks.scores / .feedback (teacher reports read these too). */
const StoredScores = z.array(z.object({ name: z.string(), level: z.string(), points: z.number(), maxPoints: z.number() }));
const StoredFeedback = z.object({
  criteria: z.array(z.object({ strengths: z.string(), nextStep: z.string() })),
  overall: z.string(),
});

export async function getStudentRubric(assignmentId: string): Promise<StudentRubricCriterion[]> {
  const rubric = await db.query.rubrics.findFirst({
    where: eq(rubrics.assignmentId, assignmentId),
    with: {
      criteria: { orderBy: asc(rubricCriteria.ordinal), columns: { name: true, description: true, levels: true } },
    },
  });
  return rubric?.criteria ?? [];
}

type Row = typeof rubricChecks.$inferSelect;

export function toRubricCheckResult(row: Pick<Row, "id" | "createdAt" | "scores" | "feedback">): RubricCheckResult | null {
  const scores = StoredScores.safeParse(row.scores);
  const feedback = StoredFeedback.safeParse(row.feedback);
  if (!scores.success || !feedback.success) return null;
  return RubricCheckResult.parse({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    criteria: scores.data.map((s, i) => ({
      ...s,
      strengths: feedback.data.criteria[i]?.strengths ?? "",
      nextStep: feedback.data.criteria[i]?.nextStep ?? "",
    })),
    totalPoints: scores.data.reduce((n, s) => n + s.points, 0),
    maxPoints: scores.data.reduce((n, s) => n + s.maxPoints, 0),
    overall: feedback.data.overall,
  });
}

export async function getLatestRubricCheck(studentId: string, assignmentId: string): Promise<RubricCheckResult | null> {
  const row = await db.query.rubricChecks.findFirst({
    where: and(eq(rubricChecks.studentId, studentId), eq(rubricChecks.assignmentId, assignmentId)),
    orderBy: desc(rubricChecks.createdAt),
    columns: { id: true, createdAt: true, scores: true, feedback: true },
  });
  return row ? toRubricCheckResult(row) : null;
}
