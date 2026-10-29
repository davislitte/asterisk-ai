import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import {
  type AgentStep,
  CLASS_REPORT_PROMPT_VERSION,
  type ClassReport,
  type ClassReportData,
  canonicalLabel,
  estimateUsd,
  runClassReport,
} from "@/server/ai";
import type { TeacherAssignment } from "@/server/assignments";
import { type ClassWork, type StudentWork, flagCounts, loadClassWork, studentText } from "./class-work";

/** T8 class report: runs the misconception agent over the class's work and stores the result. */

const MAX_SNIPPETS = 40;
const MAX_MESSAGES_PER_STUDENT = 30;

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

/** The agent's read-only view of the class. Students appear only by label. */
export function classReportData(work: ClassWork): ClassReportData {
  const byLabel = new Map(work.students.map((s) => [s.label, s]));
  const find = (raw: string): StudentWork => {
    const label = canonicalLabel(raw);
    const student = label ? byLabel.get(label) : undefined;
    if (!student) throw new Error(`No student "${raw}". Labels run from Student 01 to ${work.students.at(-1)?.label ?? "Student 01"}.`);
    return student;
  };

  return {
    async overview() {
      const criteria = work.criteria.map((name, i) => {
        const levels: Record<string, number> = {};
        for (const s of work.students) {
          const level = s.latestCheck?.criteria[i]?.level;
          if (level) levels[level] = (levels[level] ?? 0) + 1;
        }
        return { criterion: i + 1, name, levels, notChecked: work.students.filter((s) => !s.latestCheck).length };
      });
      return {
        studentCount: work.students.length,
        submitted: work.students.filter((s) => s.submittedAt).length,
        rubricCriteria: criteria,
        comprehensionQuestions: work.questions.map((text, i) => ({ question: i + 1, text })),
        students: work.students.map((s) => ({
          student: s.label,
          submitted: Boolean(s.submittedAt),
          rubricChecks: s.checkCount,
          latestLevels: s.latestCheck?.criteria.map((c) => `${c.name}: ${c.level}`) ?? [],
          comprehension: s.answers.map((a) => `Q${a.question}: ${a.understanding ?? "ungraded"}`),
          messages: s.messages.length,
          flags: flagCounts(s),
        })),
      };
    },

    async studentWork(raw) {
      const s = find(raw);
      return {
        student: s.label,
        submitted: Boolean(s.submittedAt),
        latestDraft: s.latestCheck?.draft ?? "(no rubric check yet, so no draft)",
        rubric: s.latestCheck?.criteria.map((c) => ({ criterion: c.name, level: c.level, feedback: c.nextStep })) ?? [],
        comprehension: s.answers.map((a) => ({
          question: a.question,
          answer: a.answer,
          understanding: a.understanding,
          graderNote: a.rationale,
        })),
        photoOfWork: s.photos.findLast((p) => p.legible)?.problems.map((p) => ({ problem: p.problemId, read: p.reading })) ?? null,
        messages: s.messages.slice(-MAX_MESSAGES_PER_STUDENT).map((m) => ({
          text: m.content,
          ...(m.flags.length ? { flags: m.flags } : {}),
        })),
      };
    },

    async search(terms) {
      const needles = terms.map((t) => t.toLowerCase());
      const matches: { student: string; where: string; snippet: string }[] = [];
      const students = new Set<string>();
      let total = 0;
      for (const s of work.students) {
        const places: [string, string][] = [
          ["draft", s.latestCheck?.draft ?? ""],
          ...s.messages.map((m): [string, string] => ["chat", m.content]),
          ...s.answers.map((a): [string, string] => [`comprehension Q${a.question}`, a.answer]),
          ...s.photos.flatMap((ph) => ph.problems.map((p): [string, string] => [`photo, problem ${p.problemId}`, p.reading])),
        ];
        for (const [where, text] of places) {
          const lower = text.toLowerCase();
          const hit = needles
            .map((n) => ({ n, i: lower.indexOf(n) }))
            .filter((h) => h.i >= 0)
            .sort((a, b) => a.i - b.i)[0];
          if (!hit) continue;
          total++;
          students.add(s.label);
          if (matches.length < MAX_SNIPPETS) matches.push({ student: s.label, where, snippet: snippet(text, hit.i, hit.n.length) });
        }
      }
      return {
        terms,
        matchingStudents: students.size,
        students: [...students],
        totalMatches: total,
        matches,
        ...(total > matches.length ? { note: `Showing ${matches.length} of ${total} matches.` } : {}),
      };
    },

    async rubricCriterion(n) {
      const name = work.criteria[n - 1];
      if (!name) throw new Error(`There are ${work.criteria.length} rubric criteria.`);
      return {
        criterion: n,
        name,
        students: work.students.map((s) => {
          const c = s.latestCheck?.criteria[n - 1];
          return c ? { student: s.label, level: c.level, feedback: c.nextStep } : { student: s.label, level: "not checked" };
        }),
      };
    },

    async comprehensionQuestion(n) {
      const text = work.questions[n - 1];
      if (!text) throw new Error(`There are ${work.questions.length} comprehension questions.`);
      return {
        question: n,
        text,
        answers: work.students.flatMap((s) => {
          const a = s.answers.find((x) => x.question === n);
          return a ? [{ student: s.label, answer: a.answer, understanding: a.understanding, graderNote: a.rationale }] : [];
        }),
        notAnswered: work.students.filter((s) => !s.answers.some((x) => x.question === n)).length,
      };
    },

    async sourceSectionUsage() {
      return sectionUsage(work).map((u) => ({
        section: u.ref,
        tutorRepliesCiting: u.replies,
        students: u.students.size,
        sampleQuestions: u.samples,
      }));
    },

    async corpus() {
      return new Map(work.students.map((s) => [s.label, studentText(s)]));
    },
  };
}

/** Which note sections the tutor cited, for how many students, and what was asked. Deterministic. */
export function sectionUsage(work: ClassWork) {
  const usage = new Map(work.sections.map((s) => [s.ref, { ref: s.ref, replies: 0, students: new Set<string>(), samples: [] as string[] }]));
  for (const s of work.students) {
    for (const m of s.messages) {
      for (const ref of new Set(m.citedRefs)) {
        const u = usage.get(ref);
        if (!u) continue;
        u.replies++;
        u.students.add(s.id);
        if (u.samples.length < 4) u.samples.push(m.content.slice(0, 200));
      }
    }
  }
  return [...usage.values()].sort((a, b) => b.replies - a.replies);
}

const StoredClassReport = z.object({
  promptVersion: z.string(),
  report: z.custom<ClassReport>((v) => typeof v === "object" && v !== null && "misconceptions" in v),
  /** label → student id at the time of the run. */
  labels: z.record(z.string(), z.string()),
  steps: z.array(z.custom<AgentStep>()),
  rounds: z.number(),
  finishedInvestigating: z.boolean(),
  studentCount: z.number(),
  usage: z.object({ tokensIn: z.number(), tokensOut: z.number() }),
  costUsd: z.number(),
  latencyMs: z.number(),
});
export type StoredClassReport = z.infer<typeof StoredClassReport> & { id: string; createdAt: Date };

export async function generateClassReport(assignment: TeacherAssignment): Promise<StoredClassReport> {
  const work = await loadClassWork(assignment.id, assignment.classId);
  const run = await runClassReport(
    {
      assignment,
      problems: assignment.problems,
      sourceSections: work.sections.map((s) => s.ref),
      rubricCriteria: work.criteria,
      checkQuestions: work.questions,
      studentCount: work.students.length,
    },
    classReportData(work),
  );

  const payload: z.infer<typeof StoredClassReport> = {
    promptVersion: CLASS_REPORT_PROMPT_VERSION,
    report: run.report,
    labels: Object.fromEntries(work.students.map((s) => [s.label, s.id])),
    steps: run.steps,
    rounds: run.rounds,
    finishedInvestigating: run.finishedInvestigating,
    studentCount: work.students.length,
    usage: run.usage,
    costUsd: estimateUsd(run.usage.tokensIn, run.usage.tokensOut),
    latencyMs: run.latencyMs,
  };
  const [row] = await db
    .insert(reports)
    .values({ assignmentId: assignment.id, kind: "class", payload })
    .returning({ id: reports.id, createdAt: reports.createdAt });
  return { ...payload, id: row!.id, createdAt: row!.createdAt };
}

export async function getLatestClassReport(assignmentId: string): Promise<StoredClassReport | null> {
  const row = await db.query.reports.findFirst({
    where: and(eq(reports.assignmentId, assignmentId), eq(reports.kind, "class")),
    orderBy: desc(reports.createdAt),
  });
  if (!row) return null;
  const parsed = StoredClassReport.safeParse(row.payload);
  return parsed.success ? { ...parsed.data, id: row.id, createdAt: row.createdAt } : null;
}
