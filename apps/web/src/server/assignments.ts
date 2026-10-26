import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assignments, classes } from "@/db/schema";

const Uuid = z.uuid();

/** Teacher-side view: includes answer keys. Never return this from a student route. */
export async function getAssignmentForTeacher(teacherId: string, assignmentId: string) {
  if (!Uuid.safeParse(assignmentId).success) return null;
  const [row] = await db
    .select({ assignment: assignments, className: classes.name })
    .from(assignments)
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .where(and(eq(assignments.id, assignmentId), eq(classes.teacherId, teacherId)))
    .limit(1);
  return row ? { ...row.assignment, className: row.className } : null;
}

export type TeacherAssignment = NonNullable<Awaited<ReturnType<typeof getAssignmentForTeacher>>>;
