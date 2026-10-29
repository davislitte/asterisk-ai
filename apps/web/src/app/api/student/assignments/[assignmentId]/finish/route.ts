import { FinishRequest, type FinishResponse, type StudentAssignment } from "@asterisk/shared";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { checkQuestions, comprehensionAnswers, submissions } from "@/db/schema";
import { gradeComprehensionAnswer } from "@/server/ai";
import { isUniqueViolation } from "@/server/join-code";
import { studentJson } from "@/server/student-response";
import { BUSY_MESSAGE, inFlight } from "@/server/student/rate-limits";
import {
  type Student,
  aiUnavailable,
  badRequest,
  getStudent,
  notFound,
  tooManyRequests,
  unauthorized,
} from "@/server/student/session";
import { getStudentAssignment, listGroundingChunks } from "@/server/student/data";

type Ctx = RouteContext<"/api/student/assignments/[assignmentId]/finish">;

async function approvedQuestions(assignmentId: string) {
  return db
    .select({ id: checkQuestions.id, text: checkQuestions.text })
    .from(checkQuestions)
    .where(and(eq(checkQuestions.assignmentId, assignmentId), eq(checkQuestions.approved, true)))
    .orderBy(asc(checkQuestions.ordinal));
}

async function submittedAt(student: Student, assignmentId: string) {
  const row = await db.query.submissions.findFirst({
    where: and(eq(submissions.studentId, student.id), eq(submissions.assignmentId, assignmentId)),
    columns: { submittedAt: true },
  });
  return row?.submittedAt.toISOString() ?? null;
}

/** S7: the approved comprehension questions (if the check is on) and whether the student has finished. */
export async function GET(request: Request, ctx: Ctx) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const assignment = await getStudentAssignment(student.classId, (await ctx.params).assignmentId);
  if (!assignment) return notFound();

  const body: FinishResponse = {
    endCheckEnabled: assignment.endCheckEnabled,
    questions: assignment.endCheckEnabled ? await approvedQuestions(assignment.id) : [],
    submittedAt: await submittedAt(student, assignment.id),
  };
  return studentJson(body);
}

/**
 * S7 + S8: submit typed answers and mark the assignment complete. Answers are
 * graded for the teacher's report; no grade or model text goes back to the student.
 */
export async function POST(request: Request, ctx: Ctx) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const assignment = await getStudentAssignment(student.classId, (await ctx.params).assignmentId);
  if (!assignment) return notFound();

  const parsed = FinishRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Check your answers.");
  if (await submittedAt(student, assignment.id)) {
    return studentJson({ error: "You've already marked this assignment complete." }, { status: 409 });
  }

  // One submission in flight per student, so a double click can't pay for grading twice.
  const key = `finish:${student.id}`;
  if (!inFlight.acquire(key)) return tooManyRequests(BUSY_MESSAGE);
  try {
    return await submitAnswers(student, assignment, parsed.data);
  } finally {
    inFlight.release(key);
  }
}

async function submitAnswers(student: Student, assignment: StudentAssignment, input: FinishRequest) {
  const questions = assignment.endCheckEnabled ? await approvedQuestions(assignment.id) : [];
  const answers = new Map(input.answers.map((a) => [a.questionId, a.answer]));
  if (questions.some((q) => !answers.get(q.id)) || answers.size !== questions.length) {
    return badRequest("Answer every question before you finish.");
  }

  let graded;
  try {
    const sources = (await listGroundingChunks(assignment.id)).map((c, i) => ({
      label: `S${i + 1}`,
      sourceTitle: c.sourceTitle,
      ref: c.ref,
      text: c.text,
    }));
    graded = await Promise.all(
      questions.map(async (q) => ({
        questionId: q.id,
        answer: answers.get(q.id)!,
        grade: await gradeComprehensionAnswer({ assignment, sources, question: q.text, answer: answers.get(q.id)! }),
      })),
    );
  } catch (err) {
    // Nothing is saved, so the student can resubmit the same answers.
    return aiUnavailable(err, "finish");
  }

  // A double submit races here; the unique index rejects the second and rolls back its answers.
  const finishedAt = await db.transaction(async (tx) => {
    if (graded.length) {
      await tx.insert(comprehensionAnswers).values(
        graded.map((g) => ({
          studentId: student.id,
          questionId: g.questionId,
          transcript: g.answer, // typed answer (the column predates the text-only decision)
          score: g.grade.score,
          rationale: g.grade.misconception ? `${g.grade.rationale} Misconception: ${g.grade.misconception}` : g.grade.rationale,
        })),
      );
    }
    const [row] = await tx
      .insert(submissions)
      .values({ studentId: student.id, assignmentId: assignment.id })
      .returning({ submittedAt: submissions.submittedAt });
    return row!.submittedAt;
  }).catch((err: unknown) => {
    if (isUniqueViolation(err)) return null;
    throw err;
  });
  if (!finishedAt) {
    return studentJson({ error: "You've already marked this assignment complete." }, { status: 409 });
  }

  const body: FinishResponse = {
    endCheckEnabled: assignment.endCheckEnabled,
    questions,
    submittedAt: finishedAt.toISOString(),
  };
  return studentJson(body);
}
