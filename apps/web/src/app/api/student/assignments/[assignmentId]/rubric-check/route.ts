import {
  RubricCheckRequest,
  type RubricCheckResponse,
  type StudentAssignment,
  type StudentRubricCriterion,
} from "@asterisk/shared";
import { db } from "@/db/client";
import { rubricChecks } from "@/db/schema";
import { STUDENT_SAFE_ERROR_MESSAGE, rubricCheck } from "@/server/ai";
import { studentJson } from "@/server/student-response";
import { getAnswerKeysForLeakCheck } from "@/server/student/answer-keys";
import { getStudentAssignment } from "@/server/student/data";
import { getLatestRubricCheck, getStudentRubric, toRubricCheckResult } from "@/server/student/rubric-checks";
import { rubricCheckLimitMessage } from "@/server/student/rate-limit-db";
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

type Ctx = RouteContext<"/api/student/assignments/[assignmentId]/rubric-check">;

/** The assignment's rubric (shared with students) and the student's latest pre-check. */
export async function GET(request: Request, ctx: Ctx) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const assignment = await getStudentAssignment(student.classId, (await ctx.params).assignmentId);
  if (!assignment) return notFound();

  const body: RubricCheckResponse = {
    rubric: await getStudentRubric(assignment.id),
    latest: await getLatestRubricCheck(student.id, assignment.id),
  };
  return studentJson(body);
}

/**
 * S6: grade the student's draft against the rubric. Feedback describes what to
 * improve and goes through the feedback-mode leak check; it never rewrites work.
 */
export async function POST(request: Request, ctx: Ctx) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const assignment = await getStudentAssignment(student.classId, (await ctx.params).assignmentId);
  if (!assignment) return notFound();

  const parsed = RubricCheckRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Couldn't read your draft.");

  const rubric = await getStudentRubric(assignment.id);
  if (rubric.length === 0) {
    return studentJson({ error: "Your teacher hasn't added a rubric for this assignment yet." }, { status: 409 });
  }

  // Cost protection: per-student limits, then one check at a time (the daily cap backs both).
  const limited = await rubricCheckLimitMessage(student.id);
  if (limited) return tooManyRequests(limited);
  const key = `rubric-check:${student.id}`;
  if (!inFlight.acquire(key)) return tooManyRequests(BUSY_MESSAGE);
  try {
    return await runCheck(student, assignment, rubric, parsed.data);
  } finally {
    inFlight.release(key);
  }
}

async function runCheck(
  student: Student,
  assignment: StudentAssignment,
  rubric: StudentRubricCriterion[],
  input: RubricCheckRequest,
) {
  const answerKeys = await getAnswerKeysForLeakCheck(student.classId, assignment.id);
  let result;
  try {
    result = await rubricCheck({
      assignment,
      problems: assignment.problems.map((p) => ({ ...p, answerKey: answerKeys[p.id] })),
      criteria: rubric,
      draft: input.draft,
    });
  } catch (err) {
    return aiUnavailable(err, "rubric-check");
  }

  const [row] = await db
    .insert(rubricChecks)
    .values({
      studentId: student.id,
      assignmentId: assignment.id,
      draftText: input.draft,
      scores: result.criteria.map(({ name, level, points, maxPoints }) => ({ name, level, points, maxPoints })),
      feedback: {
        criteria: result.criteria.map(({ strengths, nextStep }) => ({ strengths, nextStep })),
        overall: result.overall,
        source: input.source,
        guard: result.guard,
      },
    })
    .returning({ id: rubricChecks.id, createdAt: rubricChecks.createdAt, scores: rubricChecks.scores, feedback: rubricChecks.feedback });

  const check = toRubricCheckResult(row!);
  if (!check) return studentJson({ error: STUDENT_SAFE_ERROR_MESSAGE }, { status: 500 });
  const body: RubricCheckResponse = { rubric, latest: check };
  return studentJson(body);
}
