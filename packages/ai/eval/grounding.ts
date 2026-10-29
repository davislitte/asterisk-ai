import type { HelpLevel } from "@asterisk/shared";
import { baselinePromptV1 } from "../prompts/baseline";
import { GROUNDING_JUDGE_PROMPT_VERSION, GroundingVerdict, groundingJudgePromptV1 } from "../prompts/grounding-judge";
import { complete, completeJson } from "../provider/client";
import { guardedTutorReply } from "../tasks/guarded-tutor";
import { EVAL_ANSWER_KEYS, EVAL_SOURCES, evalAssignment } from "./fixture";
import { GROUNDING_CASES, GROUNDING_CONTROLS, type GroundingCase } from "./grounding-cases";

/**
 * Grounding part of `pnpm eval`: does the tutor teach only from the teacher's
 * notes? Every case runs through the full guarded pipeline at each help level,
 * and an eval-only judge lists anything in the reply the notes don't contain.
 * The typical-tutor-prompt baseline (same notes, no grounding rule) answers the
 * off-source questions for comparison.
 */

export { GROUNDING_JUDGE_PROMPT_VERSION };

export interface GroundingRow {
  caseId: string;
  kind: GroundingCase["kind"];
  helpLevel: HelpLevel | "baseline";
  message: string;
  reply: string;
  citations: string[];
  outsideClaims: string[];
  saysNotCovered: boolean;
  citedExpected: boolean;
  reason: string;
  error?: string;
}

type Pool = <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise<R[]>;

async function judgeGrounding(studentMessage: string, reply: string): Promise<GroundingVerdict> {
  const result = await completeJson({
    purpose: "eval.grounding_judge",
    messages: groundingJudgePromptV1({ sources: EVAL_SOURCES, studentMessage, reply }),
    schemaName: "grounding_verdict",
    schema: GroundingVerdict,
    reasoningEffort: "high",
  });
  return result.data;
}

const errorRow = (c: GroundingCase, helpLevel: GroundingRow["helpLevel"], err: unknown): GroundingRow => ({
  caseId: c.id,
  kind: c.kind,
  helpLevel,
  message: c.message,
  reply: "",
  citations: [],
  outsideClaims: [],
  saysNotCovered: false,
  citedExpected: false,
  reason: "",
  error: err instanceof Error ? err.message : String(err),
});

async function runTutor(c: GroundingCase, helpLevel: HelpLevel): Promise<GroundingRow> {
  try {
    const out = await guardedTutorReply({
      assignment: evalAssignment(helpLevel),
      sources: EVAL_SOURCES,
      history: [],
      message: c.message,
      answerKeys: EVAL_ANSWER_KEYS,
    });
    const verdict = await judgeGrounding(c.message, out.reply);
    return {
      caseId: c.id,
      kind: c.kind,
      helpLevel,
      message: c.message,
      reply: out.reply,
      citations: out.citations,
      outsideClaims: verdict.outsideClaims,
      saysNotCovered: verdict.saysNotCovered,
      citedExpected: (c.expectLabels ?? []).some((l) => out.citations.includes(l)),
      reason: verdict.reason,
    };
  } catch (err) {
    return errorRow(c, helpLevel, err);
  }
}

async function runBaseline(c: GroundingCase): Promise<GroundingRow> {
  try {
    const { helpLevel: _unused, ...assignment } = evalAssignment(2);
    const out = await complete({
      purpose: "eval.baseline.naive",
      messages: baselinePromptV1("naive", { assignment, sources: EVAL_SOURCES, history: [], message: c.message }),
      reasoningEffort: "low",
    });
    const verdict = await judgeGrounding(c.message, out.text);
    return {
      caseId: c.id,
      kind: c.kind,
      helpLevel: "baseline",
      message: c.message,
      reply: out.text,
      citations: [],
      outsideClaims: verdict.outsideClaims,
      saysNotCovered: verdict.saysNotCovered,
      citedExpected: false,
      reason: verdict.reason,
    };
  } catch (err) {
    return errorRow(c, "baseline", err);
  }
}

/** Does the judge flag replies written to use outside knowledge, and pass grounded ones? */
async function runControls(pool: Pool) {
  const results = await pool(GROUNDING_CONTROLS, async (c) => {
    const verdict = await judgeGrounding(c.studentMessage, c.reply);
    return { ...c, flagged: verdict.outsideClaims.length > 0 };
  });
  const outside = results.filter((r) => r.outside);
  const inside = results.filter((r) => !r.outside);
  return {
    line:
      `Grounding judge caught ${outside.filter((r) => r.flagged).length}/${outside.length} replies written to use outside knowledge, ` +
      `falsely flagged ${inside.filter((r) => r.flagged).length}/${inside.length} grounded ones.`,
    misses: results.filter((r) => r.flagged !== r.outside).map((r) => `${r.id} (flagged: ${r.flagged}, expected: ${r.outside})`),
  };
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`);

export async function runGroundingEval(options: { levels: HelpLevel[]; pool: Pool; baselines: boolean; baselineRepeats: number }) {
  const controls = await runControls(options.pool);
  console.info(`  ${controls.line}`);
  for (const m of controls.misses) console.info(`  ✗ ${m}`);

  const jobs = options.levels.flatMap((level) => GROUNDING_CASES.map((c) => ({ c, level })));
  const rows = await options.pool(jobs, ({ c, level }) => runTutor(c, level));
  const offCases = GROUNDING_CASES.filter((c) => c.kind === "off");
  const baselineJobs = options.baselines
    ? offCases.flatMap((c) => Array.from({ length: options.baselineRepeats }, () => c))
    : [];
  const baselineRows = baselineJobs.length ? await options.pool(baselineJobs, runBaseline) : [];

  const ok = rows.filter((r) => !r.error);
  const clean = (r: GroundingRow) => r.outsideClaims.length === 0;
  const lines = [
    "| Help level | Not-in-notes questions | Used only the notes | Said the notes don't cover it | In-notes questions | Used only the notes | Cited the right section |",
    "|---|---|---|---|---|---|---|",
  ];
  const row = (label: string, r: GroundingRow[]) => {
    const off = r.filter((x) => x.kind === "off");
    const on = r.filter((x) => x.kind === "on");
    return `| ${label} | ${off.length} | ${pct(off.filter(clean).length, off.length)} | ${pct(off.filter((x) => x.saysNotCovered).length, off.length)} | ${on.length} | ${pct(on.filter(clean).length, on.length)} | ${pct(on.filter((x) => x.citedExpected).length, on.length)} |`;
  };
  for (const level of options.levels) lines.push(row(String(level), ok.filter((r) => r.helpLevel === level)));
  lines.push(row("**All**", ok));

  const baselineOk = baselineRows.filter((r) => !r.error);
  if (baselineOk.length) {
    const askedOff = ok.filter((r) => r.kind === "off");
    lines.push(
      "",
      "| Not-in-notes questions (same notes, same judge) | Runs | Used outside knowledge |",
      "|---|---|---|",
      `| Muse Spark + typical tutor prompt (notes included, no grounding rule) | ${baselineOk.length} | ${pct(baselineOk.filter((r) => !clean(r)).length, baselineOk.length)} |`,
      `| **Asterisk** | ${askedOff.length} | **${pct(askedOff.filter((r) => !clean(r)).length, askedOff.length)}** |`,
    );
  }

  return {
    lines,
    controls,
    rows,
    baselineRows,
    errors: rows.length - ok.length + baselineRows.length - baselineOk.length,
    outside: ok.filter((r) => !clean(r)),
  };
}
