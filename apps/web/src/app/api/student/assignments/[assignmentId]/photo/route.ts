import { PhotoFeedbackRequest, type PhotoFeedbackResponse, type StudentAssignment } from "@asterisk/shared";
import { db } from "@/db/client";
import { workPhotos } from "@/db/schema";
import { STUDENT_SAFE_ERROR_MESSAGE, photoFeedback } from "@/server/ai";
import { studentJson } from "@/server/student-response";
import { getAnswerKeysForLeakCheck } from "@/server/student/answer-keys";
import { getStudentAssignment } from "@/server/student/data";
import { getLatestPhoto, toPhotoFeedbackResult } from "@/server/student/photos";
import { photoLimitMessage } from "@/server/student/rate-limit-db";
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

type Ctx = RouteContext<"/api/student/assignments/[assignmentId]/photo">;

/** The student's latest photo feedback. */
export async function GET(request: Request, ctx: Ctx) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const assignment = await getStudentAssignment(student.classId, (await ctx.params).assignmentId);
  if (!assignment) return notFound();

  const body: PhotoFeedbackResponse = { latest: await getLatestPhoto(student.id, assignment.id) };
  return studentJson(body);
}

/**
 * S5: feedback on a photo of handwritten work. Muse Spark vision reads the
 * work; feedback goes through the feedback-mode leak check. The photo is not stored.
 */
export async function POST(request: Request, ctx: Ctx) {
  const student = await getStudent(request);
  if (!student) return unauthorized();
  const assignment = await getStudentAssignment(student.classId, (await ctx.params).assignmentId);
  if (!assignment) return notFound();

  const parsed = PhotoFeedbackRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Couldn't read that photo.");
  if (assignment.problems.length === 0) {
    return studentJson({ error: "Your teacher hasn't listed problems for this assignment yet." }, { status: 409 });
  }

  // Cost protection: per-student limits, then one photo at a time (the daily cap backs both).
  const limited = await photoLimitMessage(student.id);
  if (limited) return tooManyRequests(limited);
  const key = `photo:${student.id}`;
  if (!inFlight.acquire(key)) return tooManyRequests(BUSY_MESSAGE);
  try {
    return await runPhoto(student, assignment, parsed.data.image);
  } finally {
    inFlight.release(key);
  }
}

async function runPhoto(student: Student, assignment: StudentAssignment, image: string) {
  const answerKeys = await getAnswerKeysForLeakCheck(student.classId, assignment.id);
  let result;
  try {
    result = await photoFeedback({
      assignment,
      problems: assignment.problems.map((p) => ({ ...p, answerKey: answerKeys[p.id] })),
      imageDataUrl: image,
    });
  } catch (err) {
    return aiUnavailable(err, "photo");
  }

  const [row] = await db
    .insert(workPhotos)
    .values({
      studentId: student.id,
      assignmentId: assignment.id,
      legible: result.legible,
      problems: result.problems,
      overall: result.overall,
      guard: result.guard,
    })
    .returning();

  const latest = toPhotoFeedbackResult(row!);
  if (!latest) return studentJson({ error: STUDENT_SAFE_ERROR_MESSAGE }, { status: 500 });
  const body: PhotoFeedbackResponse = { latest };
  return studentJson(body);
}
