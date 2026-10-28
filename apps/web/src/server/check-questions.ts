import "server-only";
import type { CheckQuestionsInput } from "@asterisk/shared";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { checkQuestions, comprehensionAnswers, students, submissions } from "@/db/schema";

/** T6 + S7 data access. Call only after an ownership check (getAssignmentForTeacher). */

export async function listCheckQuestions(assignmentId: string) {
  return db
    .select({
      id: checkQuestions.id,
      text: checkQuestions.text,
      approved: checkQuestions.approved,
      origin: checkQuestions.origin,
      answerCount: sql<number>`(select count(*) from comprehension_answers ca where ca.question_id = "check_questions"."id")::int`,
    })
    .from(checkQuestions)
    .where(eq(checkQuestions.assignmentId, assignmentId))
    .orderBy(asc(checkQuestions.ordinal));
}

export class QuestionInUseError extends Error {}

/**
 * Updates questions in place (answers reference them), inserts new ones, and
 * deletes removed ones, refusing to delete a question students have answered.
 */
export async function saveCheckQuestions(assignmentId: string, input: CheckQuestionsInput): Promise<void> {
  await db.transaction(async (tx) => {
    const keepIds = input.questions.flatMap((q) => (q.id ? [q.id] : []));
    const removed = await tx
      .select({ id: checkQuestions.id })
      .from(checkQuestions)
      .where(
        and(
          eq(checkQuestions.assignmentId, assignmentId),
          keepIds.length ? notInArray(checkQuestions.id, keepIds) : undefined,
        ),
      );
    if (removed.length) {
      const removedIds = removed.map((r) => r.id);
      const answered = await tx
        .select({ id: comprehensionAnswers.id })
        .from(comprehensionAnswers)
        .where(inArray(comprehensionAnswers.questionId, removedIds))
        .limit(1);
      if (answered.length) {
        throw new QuestionInUseError("Students have answered a question you removed. Unapprove it instead of deleting it.");
      }
      await tx.delete(checkQuestions).where(inArray(checkQuestions.id, removedIds));
    }

    for (const [ordinal, q] of input.questions.entries()) {
      if (q.id) {
        await tx
          .update(checkQuestions)
          .set({ text: q.text, approved: q.approved, ordinal })
          .where(and(eq(checkQuestions.id, q.id), eq(checkQuestions.assignmentId, assignmentId)));
      } else {
        await tx.insert(checkQuestions).values({ assignmentId, text: q.text, approved: q.approved, origin: q.origin, ordinal });
      }
    }
  });
}

/** Every student's submission status and graded answers, for the teacher. */
export async function listComprehensionResponses(assignmentId: string, classId: string) {
  const [roster, subs, answers] = await Promise.all([
    db.select({ id: students.id, name: students.displayName }).from(students).where(eq(students.classId, classId)).orderBy(asc(students.displayName)),
    db.select({ studentId: submissions.studentId, submittedAt: submissions.submittedAt }).from(submissions).where(eq(submissions.assignmentId, assignmentId)),
    db
      .select({
        studentId: comprehensionAnswers.studentId,
        questionId: comprehensionAnswers.questionId,
        answer: comprehensionAnswers.transcript,
        score: comprehensionAnswers.score,
        rationale: comprehensionAnswers.rationale,
      })
      .from(comprehensionAnswers)
      .innerJoin(checkQuestions, eq(comprehensionAnswers.questionId, checkQuestions.id))
      .where(eq(checkQuestions.assignmentId, assignmentId))
      .orderBy(asc(checkQuestions.ordinal)),
  ]);
  const submittedAt = new Map(subs.map((s) => [s.studentId, s.submittedAt]));
  return roster.map((s) => ({
    studentId: s.id,
    name: s.name,
    submittedAt: submittedAt.get(s.id) ?? null,
    answers: answers.filter((a) => a.studentId === s.id),
  }));
}
