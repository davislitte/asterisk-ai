import "server-only";
import { type StudentAssignment, toStudentAssignment } from "@asterisk/shared";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assignments, chatMessages, classes, sourceChunks, sources } from "@/db/schema";

/**
 * Student-side data access. Assignment rows are converted to the
 * answer-key-free StudentAssignment view before they leave this module.
 */

const Uuid = z.uuid();

export async function getClassName(classId: string): Promise<string> {
  const klass = await db.query.classes.findFirst({ where: eq(classes.id, classId), columns: { name: true } });
  return klass?.name ?? "";
}

export async function listStudentAssignments(classId: string): Promise<StudentAssignment[]> {
  const rows = await db.query.assignments.findMany({
    where: eq(assignments.classId, classId),
    orderBy: desc(assignments.createdAt),
  });
  return rows.map(toStudentAssignment);
}

/** Only assignments in the student's own class. */
export async function getStudentAssignment(classId: string, assignmentId: string): Promise<StudentAssignment | null> {
  if (!Uuid.safeParse(assignmentId).success) return null;
  const row = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)),
  });
  return row ? toStudentAssignment(row) : null;
}

export interface GroundingChunk {
  id: string;
  ref: string;
  text: string;
  sourceTitle: string;
}

export async function listGroundingChunks(assignmentId: string): Promise<GroundingChunk[]> {
  return db
    .select({ id: sourceChunks.id, ref: sourceChunks.ref, text: sourceChunks.text, sourceTitle: sources.title })
    .from(sourceChunks)
    .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
    .where(eq(sources.assignmentId, assignmentId))
    .orderBy(asc(sources.createdAt), asc(sourceChunks.ordinal));
}

export async function listChatHistory(studentId: string, assignmentId: string, limit = 50) {
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      citedChunkIds: chatMessages.citedChunkIds,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.studentId, studentId), eq(chatMessages.assignmentId, assignmentId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function chunksByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ chunkId: sourceChunks.id, ref: sourceChunks.ref, sourceTitle: sources.title })
    .from(sourceChunks)
    .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
    .where(inArray(sourceChunks.id, ids));
}
