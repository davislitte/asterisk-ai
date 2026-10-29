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

// ---------- S5: photo of handwritten work ----------

/**
 * The panel downscales photos to ~1600 px JPEG first (well under 1 MB). The cap
 * keeps requests under typical serverless body limits (4.5 MB on Vercel).
 */
export const MAX_PHOTO_DATA_URL_CHARS = 4_000_000;

export const PhotoFeedbackRequest = z.object({
  image: z
    .string()
    .max(MAX_PHOTO_DATA_URL_CHARS, "That photo is too large. Try a smaller one.")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Upload a JPEG, PNG or WebP photo."),
});
export type PhotoFeedbackRequest = z.infer<typeof PhotoFeedbackRequest>;

export const PhotoStatus = z.enum(["on_track", "revisit", "incomplete"]);
export type PhotoStatus = z.infer<typeof PhotoStatus>;

export const PhotoFeedbackResult = z.object({
  id: z.string(),
  createdAt: z.string(),
  legible: z.boolean(),
  problems: z.array(
    z.object({
      problemId: z.string(),
      /** What Asterisk read from the photo, so the student can spot a misreading. */
      reading: z.string(),
      status: PhotoStatus,
      feedback: z.string(),
    }),
  ),
  overall: z.string(),
});
export type PhotoFeedbackResult = z.infer<typeof PhotoFeedbackResult>;

export const PhotoFeedbackResponse = z.object({ latest: PhotoFeedbackResult.nullable() });
export type PhotoFeedbackResponse = z.infer<typeof PhotoFeedbackResponse>;

// ---------- S7 + S8: comprehension check (text) and mark complete ----------

/** Grades go to the teacher only, so this shape carries no scores. */
export const FinishResponse = z.object({
  endCheckEnabled: z.boolean(),
  questions: z.array(z.object({ id: z.string(), text: z.string() })),
  submittedAt: z.string().nullable(),
});
export type FinishResponse = z.infer<typeof FinishResponse>;

export const FinishRequest = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        answer: z.string().trim().min(1, "Answer every question").max(2_000, "Keep each answer under 2,000 characters"),
      }),
    )
    .max(10),
});
export type FinishRequest = z.infer<typeof FinishRequest>;

export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;
