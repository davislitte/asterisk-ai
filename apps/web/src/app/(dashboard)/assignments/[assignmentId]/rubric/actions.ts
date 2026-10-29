"use server";

import { RubricInput, type RubricCriterionInput } from "@asterisk/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAssignmentForTeacher } from "@/server/assignments";
import { ModelCallError, RUBRIC_IMPORT_MAX_CHARS, importRubric } from "@/server/ai";
import { SPEND_CAP_TEACHER_MESSAGE } from "@/server/spend";
import { requireTeacher } from "@/server/auth";
import { replaceRubric } from "@/server/rubrics";
import { ExtractionError } from "@/server/sources/extract";
import { importFile } from "@/server/sources/import";

export interface SaveRubricResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ImportRubricResult {
  criteria?: RubricCriterionInput[];
  error?: string;
}

async function ownedAssignment(assignmentId: string) {
  const teacher = await requireTeacher();
  return getAssignmentForTeacher(teacher.id, assignmentId);
}

export async function saveRubric(assignmentId: string, input: unknown): Promise<SaveRubricResult> {
  const assignment = await ownedAssignment(assignmentId);
  if (!assignment) return { error: "Assignment not found" };

  const parsed = RubricInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  await replaceRubric(assignment.id, parsed.data);
  revalidatePath(`/assignments/${assignment.id}/rubric`);
  return { ok: true };
}

/** Parses rubric text with Muse Spark (via the provider) for the teacher to review. Not saved. */
async function parseWithModel(text: string): Promise<ImportRubricResult> {
  try {
    const rubric = await importRubric(text);
    // Re-validate against the dashboard's own limits before handing it to the editor.
    const checked = RubricInput.safeParse(rubric);
    if (!checked.success) return { error: "Asterisk couldn't turn that into a rubric. Try entering it by hand." };
    return { criteria: checked.data.criteria };
  } catch (err) {
    if (err instanceof ModelCallError && err.spendCapReached) return { error: SPEND_CAP_TEACHER_MESSAGE };
    if (!(err instanceof ModelCallError)) console.error("[rubric] import failed", err);
    return { error: "Asterisk couldn't read that rubric right now. Try again, or enter it by hand." };
  }
}

const PastedRubric = z.string().trim().min(1, "Paste your rubric first").max(RUBRIC_IMPORT_MAX_CHARS);

export async function importRubricFromText(assignmentId: string, text: unknown): Promise<ImportRubricResult> {
  if (!(await ownedAssignment(assignmentId))) return { error: "Assignment not found" };
  const parsed = PastedRubric.safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid rubric text" };
  return parseWithModel(parsed.data);
}

export async function importRubricFromFile(assignmentId: string, formData: FormData): Promise<ImportRubricResult> {
  if (!(await ownedAssignment(assignmentId))) return { error: "Assignment not found" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file first." };

  try {
    const src = await importFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    const text = src.sections.map((s) => s.text).join("\n\n");
    return parseWithModel(text.slice(0, RUBRIC_IMPORT_MAX_CHARS));
  } catch (err) {
    if (err instanceof ExtractionError) return { error: err.message };
    console.error("[rubric] file read failed", err);
    return { error: "Couldn't read that file." };
  }
}
