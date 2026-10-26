import { z } from "zod";

/** T4: how much the assistant may help. 1 = hints only … 4 = worked parallel example. */
export const HelpLevel = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type HelpLevel = z.infer<typeof HelpLevel>;

export const HELP_LEVEL_LABELS: Record<HelpLevel, string> = {
  1: "Hints only",
  2: "Socratic",
  3: "Explain concepts",
  4: "Worked example",
};

export const HELP_LEVEL_DESCRIPTIONS: Record<HelpLevel, string> = {
  1: "Asks guiding questions only. Never states facts that aren't already in the student's work.",
  2: "Guiding questions, plus points the student to the relevant section of your sources.",
  3: "Explains the concept using a different example. Never the assignment's answer.",
  4: "Shows a full worked example of a parallel problem. Never the assigned one.",
};

export const SourceKind = z.enum(["pdf", "docx", "text", "url"]);
export type SourceKind = z.infer<typeof SourceKind>;

/** Flags the off-topic / jailbreak classifier can attach to a student message. */
export const MessageFlag = z.enum(["off_topic", "answer_seeking", "jailbreak"]);
export type MessageFlag = z.infer<typeof MessageFlag>;

export const ChatRole = z.enum(["student", "assistant"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const ReportKind = z.enum(["student", "class"]);
export type ReportKind = z.infer<typeof ReportKind>;

export const QuestionOrigin = z.enum(["teacher", "generated"]);
export type QuestionOrigin = z.infer<typeof QuestionOrigin>;

/**
 * A problem the student is assigned. The guardrail pipeline lists these in the
 * system prompt and uses `answerKey` (never shown to students) for the leak check.
 */
export const AssignedProblem = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answerKey: z.string().optional(),
});
export type AssignedProblem = z.infer<typeof AssignedProblem>;

export const RubricLevel = z.object({
  label: z.string().min(1),
  points: z.number().int().min(0),
  description: z.string(),
});
export type RubricLevel = z.infer<typeof RubricLevel>;

export const RubricLevels = z.array(RubricLevel).min(1);

/** Allowlist entries are host+path patterns with `*` wildcards, e.g. `docs.google.com/document/*`. */
export const AllowlistPattern = z
  .string()
  .min(1)
  .refine((p) => !/^[a-z]+:\/\//i.test(p), "Omit the scheme (https://)");

export const DEFAULT_ALLOWLIST = ["docs.google.com/document/*"];

export const JoinCode = z
  .string()
  .regex(/^[A-Z0-9]{6}$/, "Join codes are 6 uppercase letters or digits");

export const DisplayName = z.string().trim().min(1).max(40);
