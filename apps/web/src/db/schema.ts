import type { AssignedProblem, RubricLevel } from "@asterisk/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Every table enables row-level security with no policies. The app talks to
 * Postgres directly with the server-side connection string, so Supabase's
 * public REST API (anon key) can't read any of this — it holds minors' data.
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const sourceKind = pgEnum("source_kind", ["pdf", "docx", "text", "url"]);
export const chatRole = pgEnum("chat_role", ["student", "assistant"]);
export const messageFlag = pgEnum("message_flag", ["off_topic", "answer_seeking", "jailbreak"]);
export const reportKind = pgEnum("report_kind", ["student", "class"]);
export const questionOrigin = pgEnum("question_origin", ["teacher", "generated"]);
// FAKE = the dev-only test stub in packages/ai; logged so stub calls are never mistaken for real ones.
export const aiProvider = pgEnum("ai_provider", ["META_API", "BASETEN", "MODAL", "FAKE"]);

export const teachers = pgTable("teachers", {
  id: id(),
  displayName: text("display_name").notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const classes = pgTable("classes", {
  id: id(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  createdAt: createdAt(),
}).enableRLS();

/** Display name only — no emails or other identifiers for students. */
export const students = pgTable(
  "students",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("students_class_display_name_idx").on(t.classId, t.displayName)],
).enableRLS();

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    gradeLevel: text("grade_level").notNull(),
    instructions: text("instructions").notNull(),
    /** The explicit list of assigned problems the guardrails protect. */
    problems: jsonb("problems").$type<AssignedProblem[]>().notNull().default([]),
    helpLevel: smallint("help_level").notNull().default(2),
    allowlist: text("allowlist")
      .array()
      .notNull()
      .default(sql`ARRAY['docs.google.com/document/*']::text[]`),
    endCheckEnabled: boolean("end_check_enabled").notNull().default(true),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("assignments_class_idx").on(t.classId),
    check("assignments_help_level_range", sql`${t.helpLevel} BETWEEN 1 AND 4`),
  ],
).enableRLS();

export const sources = pgTable(
  "sources",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    /** Supabase Storage object key for uploaded files. */
    fileKey: text("file_key"),
    extractedText: text("extracted_text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sources_assignment_idx").on(t.assignmentId)],
).enableRLS();

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** Human-readable citation, e.g. "p. 2, §Factoring". */
    ref: text("ref").notNull(),
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("source_chunks_source_idx").on(t.sourceId, t.ordinal)],
).enableRLS();

export const rubrics = pgTable("rubrics", {
  id: id(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .unique()
    .references(() => assignments.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}).enableRLS();

export const rubricCriteria = pgTable(
  "rubric_criteria",
  {
    id: id(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubrics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ordinal: integer("ordinal").notNull(),
    levels: jsonb("levels").$type<RubricLevel[]>().notNull(),
  },
  (t) => [index("rubric_criteria_rubric_idx").on(t.rubricId, t.ordinal)],
).enableRLS();

export const checkQuestions = pgTable(
  "check_questions",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    ordinal: integer("ordinal").notNull(),
    origin: questionOrigin("origin").notNull(),
    approved: boolean("approved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("check_questions_assignment_idx").on(t.assignmentId, t.ordinal)],
).enableRLS();

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    content: text("content").notNull(),
    citedChunkIds: uuid("cited_chunk_ids").array().notNull().default(sql`'{}'::uuid[]`),
    flags: messageFlag("flags").array().notNull().default(sql`'{}'::message_flag[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index("chat_messages_assignment_student_idx").on(t.assignmentId, t.studentId, t.createdAt),
  ],
).enableRLS();

export const rubricChecks = pgTable(
  "rubric_checks",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    draftText: text("draft_text").notNull(),
    scores: jsonb("scores").notNull(),
    feedback: jsonb("feedback").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rubric_checks_assignment_student_idx").on(t.assignmentId, t.studentId)],
).enableRLS();

export const comprehensionAnswers = pgTable(
  "comprehension_answers",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => checkQuestions.id, { onDelete: "cascade" }),
    /** Supabase Storage object key for the recorded answer, if spoken. */
    audioKey: text("audio_key"),
    transcript: text("transcript").notNull(),
    score: real("score"),
    rationale: text("rationale"),
    createdAt: createdAt(),
  },
  (t) => [index("comprehension_answers_question_student_idx").on(t.questionId, t.studentId)],
).enableRLS();

export const reports = pgTable(
  "reports",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    /** Set for per-student reports, null for class-wide ones. */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    kind: reportKind("kind").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("reports_assignment_idx").on(t.assignmentId, t.kind, t.createdAt)],
).enableRLS();

export const modelCallLogs = pgTable(
  "model_call_logs",
  {
    id: id(),
    provider: aiProvider("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    attempts: smallint("attempts").notNull().default(1),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("model_call_logs_created_idx").on(t.createdAt)],
).enableRLS();

// Relations power `db.query.*.findMany({ with: ... })`; they don't change the SQL schema.

export const sourcesRelations = relations(sources, ({ many }) => ({
  chunks: many(sourceChunks),
}));

export const sourceChunksRelations = relations(sourceChunks, ({ one }) => ({
  source: one(sources, { fields: [sourceChunks.sourceId], references: [sources.id] }),
}));

export const rubricsRelations = relations(rubrics, ({ many }) => ({
  criteria: many(rubricCriteria),
}));

export const rubricCriteriaRelations = relations(rubricCriteria, ({ one }) => ({
  rubric: one(rubrics, { fields: [rubricCriteria.rubricId], references: [rubrics.id] }),
}));
