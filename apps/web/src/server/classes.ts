import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assignments, classes } from "@/db/schema";

/** Data access for classes. Every read is scoped to the signed-in teacher. */

const Uuid = z.uuid();

export async function listClasses(teacherId: string) {
  return db
    .select({
      id: classes.id,
      name: classes.name,
      joinCode: classes.joinCode,
      // Qualify the outer column by hand: Drizzle renders `${classes.id}` as a bare
      // "id" in single-table selects, which the subquery would bind to its own id.
      assignmentCount: sql<number>`(select count(*) from assignments a where a.class_id = "classes"."id")::int`,
      studentCount: sql<number>`(select count(*) from students s where s.class_id = "classes"."id")::int`,
    })
    .from(classes)
    .where(eq(classes.teacherId, teacherId))
    .orderBy(asc(classes.createdAt));
}

export async function getClassForTeacher(teacherId: string, classId: string) {
  if (!Uuid.safeParse(classId).success) return null;
  const klass = await db.query.classes.findFirst({
    where: and(eq(classes.id, classId), eq(classes.teacherId, teacherId)),
  });
  return klass ?? null;
}

export async function listAssignmentsForClass(classId: string) {
  return db
    .select({
      id: assignments.id,
      title: assignments.title,
      subject: assignments.subject,
      helpLevel: assignments.helpLevel,
      dueAt: assignments.dueAt,
      sourceCount: sql<number>`(select count(*) from sources s where s.assignment_id = "assignments"."id")::int`,
    })
    .from(assignments)
    .where(eq(assignments.classId, classId))
    .orderBy(desc(assignments.createdAt));
}
