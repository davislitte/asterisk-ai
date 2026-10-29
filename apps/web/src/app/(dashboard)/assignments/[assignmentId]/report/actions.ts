"use server";

import { revalidatePath } from "next/cache";
import { ModelCallError } from "@/server/ai";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { generateClassReport } from "@/server/reports/class-report";
import { SPEND_CAP_TEACHER_MESSAGE } from "@/server/spend";

// One report run per assignment at a time, so a double click can't pay twice.
const running = new Set<string>();

export async function generateReport(assignmentId: string): Promise<{ ok?: boolean; error?: string }> {
  const teacher = await requireTeacher();
  const assignment = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) return { error: "Assignment not found" };
  if (running.has(assignment.id)) return { error: "A report is already being built for this assignment." };

  running.add(assignment.id);
  try {
    await generateClassReport(assignment);
  } catch (err) {
    if (err instanceof ModelCallError && err.spendCapReached) return { error: SPEND_CAP_TEACHER_MESSAGE };
    console.error("[report] class report failed", err);
    return { error: "Asterisk couldn't build the report right now. Try again in a minute." };
  } finally {
    running.delete(assignment.id);
  }
  revalidatePath(`/assignments/${assignment.id}/report`);
  return { ok: true };
}
