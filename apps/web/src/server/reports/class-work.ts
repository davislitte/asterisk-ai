import "server-only";
import { asc, eq } from "drizzle-orm";
import { UNDERSTANDING_LEVELS } from "@/server/ai";
import { db } from "@/db/client";
import {
  chatMessages,
  checkQuestions,
  comprehensionAnswers,
  rubricChecks,
  rubricCriteria,
  rubrics,
  sourceChunks,
  sources,
  students,
  submissions,
} from "@/db/schema";
import { toRubricCheckResult } from "@/server/student/rubric-checks";

/**
 * Everything students did on one assignment, loaded once and shared by the
 * teacher reports and the class report agent's tools. Teacher-only: call after
 * an ownership check (getAssignmentForTeacher).
 */

export type Understanding = (typeof UNDERSTANDING_LEVELS)[number];

export interface CheckCriterion {
  name: string;
  level: string;
  points: number;
  maxPoints: number;
  strengths: string;
  nextStep: string;
}

export interface StudentWork {
  id: string;
  name: string;
  /** Pseudonym the class report agent sees instead of the name. */
  label: string;
  submittedAt: Date | null;
  checkCount: number;
  firstCheckPoints: number | null;
  latestCheck: {
    draft: string;
    createdAt: Date;
    criteria: CheckCriterion[];
    overall: string;
    totalPoints: number;
    maxPoints: number;
  } | null;
  answers: { question: number; text: string; answer: string; understanding: Understanding | null; rationale: string }[];
  messages: { id: string; content: string; flags: string[]; createdAt: Date; citedRefs: string[] }[];
}

export interface ClassWork {
  students: StudentWork[];
  criteria: string[];
  questions: string[];
  sections: { id: string; ref: string }[];
}

export function labelFor(index: number): string {
  return `Student ${String(index + 1).padStart(2, "0")}`;
}

export async function loadClassWork(assignmentId: string, classId: string): Promise<ClassWork> {
  const [roster, checks, questionRows, answerRows, messageRows, submitted, rubric, chunks] = await Promise.all([
    db
      .select({ id: students.id, name: students.displayName })
      .from(students)
      .where(eq(students.classId, classId))
      .orderBy(asc(students.createdAt), asc(students.id)),
    db
      .select()
      .from(rubricChecks)
      .where(eq(rubricChecks.assignmentId, assignmentId))
      .orderBy(asc(rubricChecks.createdAt)),
    db
      .select({ id: checkQuestions.id, text: checkQuestions.text, approved: checkQuestions.approved })
      .from(checkQuestions)
      .where(eq(checkQuestions.assignmentId, assignmentId))
      .orderBy(asc(checkQuestions.ordinal)),
    db
      .select({
        studentId: comprehensionAnswers.studentId,
        questionId: comprehensionAnswers.questionId,
        answer: comprehensionAnswers.transcript,
        score: comprehensionAnswers.score,
        rationale: comprehensionAnswers.rationale,
      })
      .from(comprehensionAnswers)
      .innerJoin(checkQuestions, eq(comprehensionAnswers.questionId, checkQuestions.id))
      .where(eq(checkQuestions.assignmentId, assignmentId)),
    db
      .select({
        id: chatMessages.id,
        studentId: chatMessages.studentId,
        role: chatMessages.role,
        content: chatMessages.content,
        flags: chatMessages.flags,
        citedChunkIds: chatMessages.citedChunkIds,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.assignmentId, assignmentId))
      .orderBy(asc(chatMessages.createdAt)),
    db
      .select({ studentId: submissions.studentId, submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId)),
    db.query.rubrics.findFirst({
      where: eq(rubrics.assignmentId, assignmentId),
      with: { criteria: { orderBy: asc(rubricCriteria.ordinal), columns: { name: true } } },
    }),
    db
      .select({ id: sourceChunks.id, ref: sourceChunks.ref })
      .from(sourceChunks)
      .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
      .where(eq(sources.assignmentId, assignmentId))
      .orderBy(asc(sources.createdAt), asc(sourceChunks.ordinal)),
  ]);

  const refById = new Map(chunks.map((c) => [c.id, c.ref]));
  const questions = questionRows.filter((q) => q.approved || answerRows.some((a) => a.questionId === q.id));
  const questionIndex = new Map(questions.map((q, i) => [q.id, i + 1]));

  const work = new Map<string, StudentWork>(
    roster.map((s, i) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        label: labelFor(i),
        submittedAt: null,
        checkCount: 0,
        firstCheckPoints: null,
        latestCheck: null,
        answers: [],
        messages: [],
      },
    ]),
  );

  for (const row of checks) {
    const w = work.get(row.studentId);
    const check = toRubricCheckResult(row);
    if (!w || !check) continue;
    w.checkCount++;
    w.firstCheckPoints ??= check.totalPoints;
    w.latestCheck = {
      draft: row.draftText,
      createdAt: row.createdAt,
      criteria: check.criteria,
      overall: check.overall,
      totalPoints: check.totalPoints,
      maxPoints: check.maxPoints,
    };
  }

  for (const a of answerRows) {
    const w = work.get(a.studentId);
    const n = questionIndex.get(a.questionId);
    if (!w || !n) continue;
    const level = a.score === null ? null : (UNDERSTANDING_LEVELS[Math.round(a.score)] ?? null);
    w.answers.push({ question: n, text: questions[n - 1]!.text, answer: a.answer, understanding: level, rationale: a.rationale ?? "" });
  }

  for (const m of messageRows) {
    const w = work.get(m.studentId);
    if (!w) continue;
    if (m.role === "student") {
      w.messages.push({ id: m.id, content: m.content, flags: m.flags, createdAt: m.createdAt, citedRefs: [] });
    } else {
      // A tutor reply's citations belong to the question that led to it.
      const last = w.messages.at(-1);
      if (last && last.citedRefs.length === 0) last.citedRefs = m.citedChunkIds.flatMap((id) => refById.get(id) ?? []);
    }
  }

  for (const s of submitted) {
    const w = work.get(s.studentId);
    if (w) w.submittedAt = s.submittedAt;
  }

  for (const w of work.values()) w.answers.sort((a, b) => a.question - b.question);

  return {
    students: [...work.values()],
    criteria: rubric?.criteria.map((c) => c.name) ?? [],
    questions: questions.map((q) => q.text),
    sections: chunks,
  };
}

/**
 * Everything one student wrote, as one labelled text: what the recount reads and
 * what the agent's quotes are verified against. Empty if they've done nothing.
 */
export function studentText(w: StudentWork): string {
  const parts: string[] = [];
  if (w.latestCheck) parts.push(`DRAFT:\n${w.latestCheck.draft}`);
  if (w.answers.length) parts.push(`COMPREHENSION ANSWERS:\n${w.answers.map((a) => `Q${a.question}: ${a.answer}`).join("\n")}`);
  // Recent messages only, so a very chatty student can't balloon every recount call.
  if (w.messages.length) parts.push(`MESSAGES TO THE TUTOR:\n${w.messages.slice(-40).map((m) => `- ${m.content}`).join("\n")}`);
  return parts.join("\n\n");
}

export function flagCounts(w: StudentWork) {
  const count = (flag: string) => w.messages.filter((m) => m.flags.includes(flag)).length;
  return { answerSeeking: count("answer_seeking"), jailbreak: count("jailbreak"), offTopic: count("off_topic") };
}
