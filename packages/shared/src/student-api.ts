import { z } from "zod";
import { ChatRole, DisplayName } from "./domain";
import { StudentAssignment } from "./student";

/**
 * Contract between the extension and `/api/student/*`. Both sides parse with
 * these schemas. None of them carries teacher-only fields such as answer keys.
 */

export const JoinRequest = z.object({
  joinCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "Join codes are 6 letters or numbers"),
  displayName: DisplayName,
});
export type JoinRequest = z.infer<typeof JoinRequest>;

export const StudentClass = z.object({ id: z.string(), name: z.string() });

export const JoinResponse = z.object({
  token: z.string(),
  student: z.object({ id: z.string(), displayName: z.string() }),
  class: StudentClass,
});
export type JoinResponse = z.infer<typeof JoinResponse>;

export const AssignmentsResponse = z.object({
  class: StudentClass,
  assignments: z.array(StudentAssignment),
});
export type AssignmentsResponse = z.infer<typeof AssignmentsResponse>;

export const MAX_DRAFT_CHARS = 30_000;

/** S4: the student's own draft, read from their Google Doc (or pasted) only when they click. */
export const DraftText = z
  .string()
  .trim()
  .min(1, "Your draft is empty")
  .max(MAX_DRAFT_CHARS, `Drafts over ${MAX_DRAFT_CHARS.toLocaleString("en-US")} characters are too long to check`);

export const ChatRequest = z.object({
  message: z.string().trim().min(1, "Type a message").max(2_000, "Keep messages under 2,000 characters"),
  draft: DraftText.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const Citation = z.object({
  chunkId: z.string(),
  ref: z.string(),
  sourceTitle: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const StudentChatMessage = z.object({
  id: z.string(),
  role: ChatRole,
  content: z.string(),
  citations: z.array(Citation),
  createdAt: z.string(),
});
export type StudentChatMessage = z.infer<typeof StudentChatMessage>;

export const ChatHistoryResponse = z.object({ messages: z.array(StudentChatMessage) });
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponse>;

export const ChatReplyResponse = z.object({
  studentMessage: StudentChatMessage,
  reply: StudentChatMessage,
});
export type ChatReplyResponse = z.infer<typeof ChatReplyResponse>;

// ---------- S6: pre-submit rubric check ----------

export const RubricCheckRequest = z.object({
  draft: DraftText,
  source: z.enum(["google_doc", "pasted"]),
});
export type RubricCheckRequest = z.infer<typeof RubricCheckRequest>;

/** Rubrics are shared with students, so the full criteria and levels are student-safe. */
export const StudentRubricCriterion = z.object({
  name: z.string(),
  description: z.string(),
  levels: z.array(z.object({ label: z.string(), points: z.number(), description: z.string() })),
});
export type StudentRubricCriterion = z.infer<typeof StudentRubricCriterion>;

export const RubricCheckResult = z.object({
  id: z.string(),
  createdAt: z.string(),
  criteria: z.array(
    z.object({
      name: z.string(),
      level: z.string(),
      points: z.number(),
      maxPoints: z.number(),
      strengths: z.string(),
      nextStep: z.string(),
    }),
  ),
  totalPoints: z.number(),
  maxPoints: z.number(),
  overall: z.string(),
});
export type RubricCheckResult = z.infer<typeof RubricCheckResult>;

export const RubricCheckResponse = z.object({
  rubric: z.array(StudentRubricCriterion),
  latest: RubricCheckResult.nullable(),
});
export type RubricCheckResponse = z.infer<typeof RubricCheckResponse>;

export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;
