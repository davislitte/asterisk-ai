"use server";

import { CheckQuestionsInput } from "@asterisk/shared";
import { revalidatePath } from "next/cache";
import { getAssignmentForTeacher, listSourcesWithChunks } from "@/server/assignments";
import { ModelCallError, generateCheckQuestions } from "@/server/ai";
import { requireTeacher } from "@/server/auth";
import { QuestionInUseError, saveCheckQuestions } from "@/server/check-questions";

async function ownedAssignment(assignmentId: string) {
  const teacher = await requireTeacher();
  return getAssignmentForTeacher(teacher.id, assignmentId);
}

export async function saveQuestions(assignmentId: string, input: unknown): Promise<{ ok?: boolean; error?: string }> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment) return { error: "Assignment not found" };
  const parsed = CheckQuestionsInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid questions" };
  try {
    await saveCheckQuestions(assignment.id, parsed.data);
  } catch (err) {
    if (err instanceof QuestionInUseError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/assignments/${assignment.id}/questions`);
  return { ok: true };
}

/** Drafts questions from the teacher's sources. Returned for review; not saved. */
export async function draftQuestions(
  assignmentId: string,
): Promise<{ questions?: { text: string; checks: string }[]; error?: string }> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment) return { error: "Assignment not found" };
  const sources = (await listSourcesWithChunks(assignment.id)).flatMap((s) =>
    s.chunks.map((c) => ({ sourceTitle: s.title, ref: c.ref, text: c.text })),
  );
  if (sources.length === 0) return { error: "Add sources first, so the questions come from your materials." };
  try {
    const questions = await generateCheckQuestions({
      assignment: { ...assignment, problems: assignment.problems.map(({ id, prompt }) => ({ id, prompt })) },
      sources: sources.map((s, i) => ({ label: `S${i + 1}`, ...s })),
      count: 3,
    });
    return { questions };
  } catch (err) {
    if (!(err instanceof ModelCallError)) console.error("[questions] draft failed", err);
    return { error: "Asterisk couldn't draft questions right now. Try again, or write your own." };
  }
}
