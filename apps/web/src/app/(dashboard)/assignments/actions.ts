"use server";

import { AssignmentInput } from "@asterisk/shared";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { assignments } from "@/db/schema";
import { getAssignmentForTeacher } from "@/server/assignments";
import { requireTeacher } from "@/server/auth";
import { getClassForTeacher } from "@/server/classes";

export interface AssignmentFormResult {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

function parse(input: unknown) {
  const parsed = AssignmentInput.safeParse(input);
  if (parsed.success) return { data: parsed.data } as const;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    fieldErrors[key] ??= issue.message;
  }
  return { result: { error: "Please fix the highlighted fields.", fieldErrors } } as const;
}

function toRow(data: AssignmentInput) {
  return {
    title: data.title,
    subject: data.subject,
    gradeLevel: data.gradeLevel,
    instructions: data.instructions,
    dueAt: data.dueAt ? new Date(data.dueAt) : null,
    // Stable, human-readable ids ("1", "2", …) in the order the teacher listed them.
    problems: data.problems.map((p, i) => ({
      id: String(i + 1),
      prompt: p.prompt,
      ...(p.answerKey ? { answerKey: p.answerKey } : {}),
    })),
    helpLevel: data.helpLevel,
    allowlist: [...new Set(data.allowlist)],
    endCheckEnabled: data.endCheckEnabled,
  };
}

export async function createAssignment(classId: string, input: unknown): Promise<AssignmentFormResult> {
  const teacher = await requireTeacher();
  const klass = await getClassForTeacher(teacher.id, classId);
  if (!klass) return { error: "Class not found" };

  const parsed = parse(input);
  if (!parsed.data) return parsed.result;

  const [created] = await db
    .insert(assignments)
    .values({ classId: klass.id, ...toRow(parsed.data) })
    .returning({ id: assignments.id });
  revalidatePath(`/classes/${klass.id}`);
  redirect(`/assignments/${created!.id}/sources`);
}

export async function updateAssignment(assignmentId: string, input: unknown): Promise<AssignmentFormResult> {
  const teacher = await requireTeacher();
  const existing = await getAssignmentForTeacher(teacher.id, assignmentId);
  if (!existing) return { error: "Assignment not found" };

  const parsed = parse(input);
  if (!parsed.data) return parsed.result;

  await db.update(assignments).set(toRow(parsed.data)).where(eq(assignments.id, existing.id));
  revalidatePath(`/assignments/${existing.id}`, "layout");
  revalidatePath(`/classes/${existing.classId}`);
  return { ok: true };
}
