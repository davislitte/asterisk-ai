import "server-only";
import type { RubricInput } from "@asterisk/shared";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { rubricCriteria, rubrics } from "@/db/schema";

/** Call only after an ownership check (getAssignmentForTeacher). */
export async function getRubricCriteria(assignmentId: string) {
  const rubric = await db.query.rubrics.findFirst({
    where: eq(rubrics.assignmentId, assignmentId),
    with: {
      criteria: {
        orderBy: asc(rubricCriteria.ordinal),
        columns: { name: true, description: true, levels: true },
      },
    },
  });
  return rubric?.criteria ?? [];
}

/** Replaces the assignment's rubric with `input` atomically. */
export async function replaceRubric(assignmentId: string, input: RubricInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [rubric] = await tx
      .insert(rubrics)
      .values({ assignmentId })
      .onConflictDoUpdate({ target: rubrics.assignmentId, set: { assignmentId } })
      .returning({ id: rubrics.id });
    await tx.delete(rubricCriteria).where(eq(rubricCriteria.rubricId, rubric!.id));
    await tx.insert(rubricCriteria).values(
      input.criteria.map((c, i) => ({
        rubricId: rubric!.id,
        name: c.name,
        description: c.description,
        levels: [...c.levels].sort((a, b) => b.points - a.points),
        ordinal: i,
      })),
    );
  });
}
