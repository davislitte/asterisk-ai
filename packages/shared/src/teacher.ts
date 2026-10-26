import { z } from "zod";
import { AllowlistPattern, AssignedProblem, DEFAULT_ALLOWLIST, HelpLevel, RubricLevels } from "./domain";

/** Inputs accepted by the teacher dashboard's server actions. */

export const ClassInput = z.object({
  name: z.string().trim().min(1, "Give the class a name").max(80),
});
export type ClassInput = z.infer<typeof ClassInput>;

export const AssignmentInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  subject: z.string().trim().min(1, "Subject is required").max(80),
  gradeLevel: z.string().trim().min(1, "Grade level is required").max(20),
  instructions: z.string().trim().min(1, "Instructions are required").max(10_000),
  /** ISO date-time string, or null for no due date. */
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  // Ids are assigned by the server ("1", "2", …) in the order listed.
  problems: z
    .array(
      AssignedProblem.omit({ id: true }).extend({
        prompt: z.string().trim().min(1, "Each problem needs a prompt").max(2_000),
        answerKey: z.string().trim().max(2_000).optional(),
      }),
    )
    .max(50),
  helpLevel: HelpLevel,
  allowlist: z
    .array(AllowlistPattern)
    .min(1, "Allow at least one site")
    .max(20)
    .default(DEFAULT_ALLOWLIST),
  endCheckEnabled: z.boolean(),
});
export type AssignmentInput = z.infer<typeof AssignmentInput>;

export const RubricCriterionInput = z.object({
  name: z.string().trim().min(1, "Each criterion needs a name").max(120),
  description: z.string().trim().max(1_000).default(""),
  levels: RubricLevels,
});
export type RubricCriterionInput = z.infer<typeof RubricCriterionInput>;

export const RubricInput = z.object({
  criteria: z.array(RubricCriterionInput).min(1, "Add at least one criterion").max(20),
});
export type RubricInput = z.infer<typeof RubricInput>;

export const PastedTextSourceInput = z.object({
  title: z.string().trim().min(1, "Give the source a title").max(200),
  text: z.string().trim().min(1, "Paste some text").max(500_000),
});

export const UrlSourceInput = z.object({
  url: z.url({ protocol: /^https?$/, error: "Enter an http(s) URL" }),
});
