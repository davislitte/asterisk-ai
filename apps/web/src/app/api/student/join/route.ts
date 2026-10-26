import { JoinRequest, type JoinResponse } from "@asterisk/shared";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { classes, students } from "@/db/schema";
import { studentJson } from "@/server/student-response";
import { badRequest, sessionSecret } from "@/server/student/session";
import { issueStudentToken } from "@/server/student/token";

/**
 * S1: join a class with its code and a display name. No accounts or emails.
 * Joining again with the same name returns the same student, so a student
 * who reinstalls the extension keeps their history (demo-grade identity).
 */
export async function POST(request: Request) {
  const parsed = JoinRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Check your join code and name.");
  const { joinCode, displayName } = parsed.data;

  const klass = await db.query.classes.findFirst({
    where: eq(classes.joinCode, joinCode),
    columns: { id: true, name: true },
  });
  if (!klass) return studentJson({ error: "No class has that join code. Check it with your teacher." }, { status: 404 });

  await db.insert(students).values({ classId: klass.id, displayName }).onConflictDoNothing();
  const student = await db.query.students.findFirst({
    where: and(eq(students.classId, klass.id), eq(students.displayName, displayName)),
    columns: { id: true, displayName: true },
  });
  if (!student) return studentJson({ error: "Couldn't join right now. Please try again." }, { status: 500 });

  const body: JoinResponse = {
    token: issueStudentToken(student.id, sessionSecret()),
    student,
    class: klass,
  };
  return studentJson(body);
}
