import type { AssignmentsResponse } from "@asterisk/shared";
import { studentJson } from "@/server/student-response";
import { getClassName, listStudentAssignments } from "@/server/student/data";
import { getStudent, unauthorized } from "@/server/student/session";

/** The student's class and its assignments, in the answer-key-free student view. */
export async function GET(request: Request) {
  const student = await getStudent(request);
  if (!student) return unauthorized();

  const body: AssignmentsResponse = {
    class: { id: student.classId, name: await getClassName(student.classId) },
    assignments: await listStudentAssignments(student.classId),
  };
  return studentJson(body);
}
