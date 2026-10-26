import { z } from "zod";
import { type AssignedProblem, HelpLevel } from "./domain";

/**
 * What the extension (or any student-facing route) may receive about an
 * assignment. Answer keys are teacher-only and are never part of this shape.
 */
export const StudentProblem = z.strictObject({
  id: z.string(),
  prompt: z.string(),
});
export type StudentProblem = z.infer<typeof StudentProblem>;

export const StudentAssignment = z.strictObject({
  id: z.string(),
  title: z.string(),
  subject: z.string(),
  gradeLevel: z.string(),
  instructions: z.string(),
  dueAt: z.string().nullable(),
  helpLevel: HelpLevel,
  allowlist: z.array(z.string()),
  endCheckEnabled: z.boolean(),
  problems: z.array(StudentProblem),
});
export type StudentAssignment = z.infer<typeof StudentAssignment>;

export interface TeacherAssignmentLike {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  instructions: string;
  dueAt: Date | null;
  helpLevel: number;
  allowlist: string[];
  endCheckEnabled: boolean;
  problems: AssignedProblem[];
}

/**
 * Builds the student view field by field (an allowlist, not a denylist), so a
 * column added to the teacher row later can't leak by accident. The result is
 * validated against a strict schema before it's returned.
 */
export function toStudentAssignment(a: TeacherAssignmentLike): StudentAssignment {
  return StudentAssignment.parse({
    id: a.id,
    title: a.title,
    subject: a.subject,
    gradeLevel: a.gradeLevel,
    instructions: a.instructions,
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    helpLevel: a.helpLevel,
    allowlist: a.allowlist,
    endCheckEnabled: a.endCheckEnabled,
    problems: a.problems.map((p) => ({ id: p.id, prompt: p.prompt })),
  });
}
