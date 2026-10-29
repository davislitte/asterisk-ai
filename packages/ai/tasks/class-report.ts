import { z } from "zod";
import {
  type ClassReportContext,
  ClassReportOutput,
  RecountOutput,
  classReportPromptV1,
  classReportRecountPromptV1,
  classReportWriteInstruction,
} from "../prompts/class-report";
import { type ReasoningEffort, completeJson } from "../provider/client";
import { type AgentStep, type AnyAgentTool, defineTool, runToolLoop } from "./tool-loop";

/**
 * T8 class misconception agent. Muse Spark investigates the class through
 * read-only tools over the teacher's own data, then writes a structured report.
 * Every claim is checked against the data before the teacher sees it: student
 * labels must exist, counts come from the verified student lists, and quotes
 * that don't appear word for word in that student's work are dropped.
 */

/** Read-only access to one assignment's class data, keyed by pseudonymous student labels. */
export interface ClassReportData {
  overview(): Promise<unknown>;
  studentWork(student: string): Promise<unknown>;
  search(terms: string[]): Promise<unknown>;
  rubricCriterion(criterion: number): Promise<unknown>;
  comprehensionQuestion(question: number): Promise<unknown>;
  sourceSectionUsage(): Promise<unknown>;
  /** Everything each student wrote (drafts, messages, answers), for verifying quotes. */
  corpus(): Promise<Map<string, string>>;
}

export function classReportTools(data: ClassReportData): AnyAgentTool[] {
  return [
    defineTool({
      name: "class_overview",
      description:
        "Class summary: every student's label with rubric pre-check levels, comprehension understanding, message and flag counts and whether they submitted, plus class-wide rubric level counts per criterion.",
      args: z.strictObject({}),
      run: () => data.overview(),
    }),
    defineTool({
      name: "get_student_work",
      description:
        "One student's latest draft, rubric levels and feedback, comprehension answers with grades, photo-of-work transcriptions and their own chat messages.",
      args: z.strictObject({ student: z.string().describe('Student label, e.g. "Student 03"') }),
      run: ({ student }: { student: string }) => data.studentWork(student),
    }),
    defineTool({
      name: "search_class_work",
      description:
        "Case-insensitive search of every student's drafts, chat messages, comprehension answers and photo transcriptions. Matches any of the terms. Returns matching snippets with student labels and how many distinct students matched.",
      args: z.strictObject({ terms: z.array(z.string().min(1)).min(1).max(8) }),
      run: ({ terms }: { terms: string[] }) => data.search(terms),
    }),
    defineTool({
      name: "get_rubric_criterion",
      description: "For one rubric criterion (1 = the first): each student's level and the feedback they got for it.",
      args: z.strictObject({ criterion: z.number().int().min(1) }),
      run: ({ criterion }: { criterion: number }) => data.rubricCriterion(criterion),
    }),
    defineTool({
      name: "get_comprehension_question",
      description:
        "For one comprehension question (1 = the first): each student's written answer, understanding level, grader rationale and misconception note.",
      args: z.strictObject({ question: z.number().int().min(1) }),
      run: ({ question }: { question: number }) => data.comprehensionQuestion(question),
    }),
    defineTool({
      name: "get_source_section_usage",
      description:
        "For each section of the teacher's notes: how many tutor replies cited it, how many students those came from, and sample student questions that led there.",
      args: z.strictObject({}),
      run: () => data.sourceSectionUsage(),
    }),
  ];
}

export interface VerifiedMisconception {
  title: string;
  explanation: string;
  problemIds: string[];
  /** Verified student labels. */
  students: string[];
  evidence: { student: string; quote: string }[];
}

export interface ClassReport {
  summary: string;
  misconceptions: VerifiedMisconception[];
  sourceSections: { ref: string; why: string }[];
  reteachPlan: ClassReportOutput["reteachPlan"];
  studentNotes: { student: string; note: string }[];
  /** What verification removed (and the recount added), shown to the teacher. */
  verification: {
    droppedQuotes: number;
    droppedStudentRefs: number;
    droppedMisconceptions: number;
    addedByRecount: number;
  };
}

/** "student 7", "Student 07" and "STUDENT 007" all become "Student 07". */
export function canonicalLabel(raw: string): string | null {
  const m = /^\s*student\s*0*(\d{1,4})\s*$/i.exec(raw);
  return m ? `Student ${m[1]!.padStart(2, "0")}` : null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** A quote counts if each part between ellipses appears in the student's own text. */
export function quoteFound(quote: string, corpus: string): boolean {
  const parts = normalize(quote)
    .replace(/^["']+|["']+$/g, "")
    .split(/\.\.\.|…/)
    .map((p) => p.trim().replace(/^[.,;:!?"' ]+|[.,;:!?"' ]+$/g, ""))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  const haystack = normalize(corpus);
  return parts.every((p) => haystack.includes(p));
}

/**
 * `recounts[i]` is the per-student recount of misconception i (null if that call
 * failed). A recounted student counts only if their quote is found in their work.
 */
export function verifyClassReport(
  output: ClassReportOutput,
  corpus: Map<string, string>,
  recounts: (RecountOutput | null)[] = [],
): ClassReport {
  const verification = { droppedQuotes: 0, droppedStudentRefs: 0, droppedMisconceptions: 0, addedByRecount: 0 };
  const known = (raw: string) => {
    const label = canonicalLabel(raw);
    if (label && corpus.has(label)) return label;
    verification.droppedStudentRefs++;
    return null;
  };

  const kept: VerifiedMisconception[] = [];
  const renumber = new Map<number, number>();
  const verified = (quotes: { student: string; quote: string }[]) =>
    quotes.flatMap((e) => {
      const student = known(e.student);
      if (!student) return [];
      if (!quoteFound(e.quote, corpus.get(student) ?? "")) {
        verification.droppedQuotes++;
        return [];
      }
      return [{ student, quote: e.quote.trim() }];
    });

  output.misconceptions.forEach((m, i) => {
    let evidence = verified(m.evidence);
    const recounted = verified(recounts[i]?.students ?? []);
    // A verified quote is evidence too, so its student counts even if the model forgot to list them.
    const listed = new Set([...m.students.flatMap((s) => known(s) ?? []), ...evidence.map((e) => e.student)]);
    const students = [...new Set([...listed, ...recounted.map((e) => e.student)])].sort();
    verification.addedByRecount += students.length - listed.size;
    if (evidence.length === 0) {
      const seen = new Set<string>();
      evidence = recounted.filter((e) => !seen.has(e.student) && seen.add(e.student)).slice(0, 3);
    }
    if (students.length === 0) {
      verification.droppedMisconceptions++;
      return;
    }
    kept.push({ title: m.title.trim(), explanation: m.explanation.trim(), problemIds: m.problemIds, students, evidence });
    renumber.set(i + 1, kept.length);
  });

  return {
    summary: output.summary.trim(),
    misconceptions: kept,
    sourceSections: output.sourceSections,
    reteachPlan: {
      ...output.reteachPlan,
      steps: output.reteachPlan.steps.map((s) => ({
        ...s,
        addresses: [...new Set(s.addresses.flatMap((n) => renumber.get(n) ?? []))],
      })),
    },
    studentNotes: output.studentNotes.flatMap((n) => {
      const student = known(n.student);
      return student ? [{ student, note: n.note.trim() }] : [];
    }),
    verification,
  };
}

export interface ClassReportRun {
  report: ClassReport;
  steps: AgentStep[];
  rounds: number;
  /** False when the investigation hit its budget before the model was done. */
  finishedInvestigating: boolean;
  usage: { tokensIn: number; tokensOut: number };
  latencyMs: number;
}

const MAX_ROUNDS = 8;
const MAX_TOOL_CALLS = 16;

export async function runClassReport(
  context: Omit<ClassReportContext, "maxToolCalls">,
  data: ClassReportData,
  options: { reasoningEffort?: ReasoningEffort } = {},
): Promise<ClassReportRun> {
  const started = performance.now();
  const effort = options.reasoningEffort ?? "low";
  const loop = await runToolLoop({
    purpose: "report.investigate",
    messages: classReportPromptV1({ ...context, maxToolCalls: MAX_TOOL_CALLS }),
    tools: classReportTools(data),
    maxRounds: MAX_ROUNDS,
    maxToolCalls: MAX_TOOL_CALLS,
    reasoningEffort: effort,
  });

  const written = await completeJson({
    purpose: "report.write",
    messages: [...loop.messages, classReportWriteInstruction()],
    schemaName: "class_report",
    schema: ClassReportOutput,
    reasoningEffort: effort,
  });

  // The investigation samples students; the recount checks every student for each misconception.
  const corpus = await data.corpus();
  const students = [...corpus].filter(([, work]) => work.trim()).map(([label, work]) => ({ label, work }));
  const recounts = await Promise.allSettled(
    written.data.misconceptions.map((misconception) =>
      completeJson({
        purpose: "report.recount",
        messages: classReportRecountPromptV1({ misconception, problems: context.problems, students }),
        schemaName: "recount",
        schema: RecountOutput,
        reasoningEffort: effort,
      }),
    ),
  );
  const usage = {
    tokensIn: loop.usage.tokensIn + (written.usage.tokensIn ?? 0),
    tokensOut: loop.usage.tokensOut + (written.usage.tokensOut ?? 0),
  };
  for (const r of recounts) {
    if (r.status !== "fulfilled") continue;
    usage.tokensIn += r.value.usage.tokensIn ?? 0;
    usage.tokensOut += r.value.usage.tokensOut ?? 0;
  }

  return {
    report: verifyClassReport(
      written.data,
      corpus,
      recounts.map((r) => (r.status === "fulfilled" ? r.value.data : null)),
    ),
    steps: loop.steps,
    rounds: loop.rounds,
    finishedInvestigating: loop.finished,
    usage,
    latencyMs: Math.round(performance.now() - started),
  };
}
