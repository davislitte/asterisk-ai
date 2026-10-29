/**
 * `pnpm eval` — adversarial answer-leak eval (CLAUDE.md §6).
 *
 * For every case × help level it runs the full guarded pipeline, then an
 * independent judge grades both the raw tutor draft and the final reply the
 * student would see. Reports raw vs guarded leak rate per help level, guard
 * actions, and classifier recall.
 *
 * Baselines: the same messages sent to the same model without Asterisk's
 * rules (plain chatbot, and a typical "don't just give the answers" tutor
 * prompt), graded by the same judge, to show what the rules add.
 *
 * Grounding: questions the teacher's notes don't cover (and some they do) run
 * through the same pipeline; an eval-only judge lists anything in each reply
 * that isn't in the notes (see eval/grounding.ts).
 *
 * Options: --levels 1,2,3,4   --limit N   --concurrency N   --allow-fake
 *          --skip-baselines   --baseline-repeats N (default 4)   --controls-only
 *          --skip-grounding   --grounding-only
 *          --reuse-baselines: take baseline rows from the newest saved run with the same model,
 *            baseline prompt and judge, instead of paying to regenerate them
 *          --max-usd N (default 10): hard cap from real token usage; stops starting new runs
 * Refuses to run on the FAKE stub unless --allow-fake, and never saves FAKE results.
 */
import type { HelpLevel, MessageFlag } from "@asterisk/shared";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { BASELINE_PROMPT_VERSION, type BaselineKind, baselinePromptV1 } from "../prompts/baseline";
import { EVAL_JUDGE_PROMPT_VERSION, evalJudgePromptV1 } from "../prompts/eval-judge";
import { CLASSIFY_PROMPT_VERSION, LEAK_CHECK_PROMPT_VERSION, LeakVerdict } from "../prompts/guard";
import { TUTOR_PROMPT_VERSION } from "../prompts/tutor";
import { complete, completeJson } from "../provider/client";
import { resolveProviderConfig } from "../provider/config";
import { estimateUsd } from "../provider/pricing";
import { setModelCallLogger } from "../provider/logging";
import { checkLeak, guardedTutorReply } from "../tasks/guarded-tutor";
import { type EvalCase, EVAL_CASES } from "./cases";
import { GRADER_CONTROLS } from "./controls";
import { GROUNDING_JUDGE_PROMPT_VERSION, runGroundingEval } from "./grounding";
import { EVAL_ANSWER_KEYS, EVAL_PROBLEMS, EVAL_SOURCES, evalAssignment } from "./fixture";

const { values: args } = parseArgs({
  options: {
    levels: { type: "string", default: "1,2,3,4" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "allow-fake": { type: "boolean", default: false },
    "controls-only": { type: "boolean", default: false },
    "skip-baselines": { type: "boolean", default: false },
    "reuse-baselines": { type: "boolean", default: false },
    "skip-grounding": { type: "boolean", default: false },
    "grounding-only": { type: "boolean", default: false },
    "baseline-repeats": { type: "string", default: "4" },
    // Hard spending cap per eval run, from real token usage as it accumulates.
    "max-usd": { type: "string", default: "10" },
  },
});

const config = resolveProviderConfig();
const isFake = config.provider === "FAKE";
if (isFake && !args["allow-fake"]) {
  console.error(
    "Refusing to run: AI_PROVIDER=FAKE is a test stub, so leak rates would be meaningless.\n" +
      "Set AI_PROVIDER=META_API (or BASETEN/MODAL), or pass --allow-fake to exercise the plumbing only.",
  );
  process.exit(1);
}

const levels = args.levels.split(",").map((l) => Number(l.trim())) as HelpLevel[];
const cases = args.limit ? EVAL_CASES.slice(0, Number(args.limit)) : EVAL_CASES;
const concurrency = Math.max(1, Number(args.concurrency));

let modelCalls = 0;
let failedCalls = 0;
let tokensIn = 0;
let tokensOut = 0;
setModelCallLogger((e) => {
  modelCalls++;
  if (!e.ok) failedCalls++;
  tokensIn += e.tokensIn ?? 0;
  tokensOut += e.tokensOut ?? 0;
});
const MAX_USD = Number(args["max-usd"]);
const spentUsd = () => estimateUsd(tokensIn, tokensOut);
let budgetHit = false;

class BudgetExceededError extends Error {}
if (isFake) console.warn = () => {}; // silence per-call stub warnings; the banner below says it all

interface Row {
  caseId: string;
  category: EvalCase["category"];
  helpLevel: HelpLevel;
  message: string;
  rawLeaked: boolean;
  finalLeaked: boolean;
  regenerated: boolean;
  fallback: boolean;
  flags: MessageFlag[];
  expectFlags: MessageFlag[];
  finalReply: string;
  judgeReason: string;
  error?: string;
}

async function judge(message: string, reply: string) {
  const result = await completeJson({
    purpose: "eval.judge",
    messages: evalJudgePromptV1({ problems: EVAL_PROBLEMS, studentMessage: message, reply }),
    schemaName: "leak_verdict",
    schema: LeakVerdict,
    reasoningEffort: "high",
  });
  return result.data;
}

async function runOne(c: EvalCase, helpLevel: HelpLevel): Promise<Row> {
  const base = { caseId: c.id, category: c.category, helpLevel, message: c.message, expectFlags: c.expectFlags };
  try {
    const out = await guardedTutorReply({
      assignment: evalAssignment(helpLevel),
      sources: EVAL_SOURCES,
      history: c.history ?? [],
      message: c.message,
      answerKeys: EVAL_ANSWER_KEYS,
    });
    const rawVerdict = await judge(c.message, out.rawDraft);
    const finalVerdict = out.reply === out.rawDraft ? rawVerdict : await judge(c.message, out.reply);
    return {
      ...base,
      rawLeaked: rawVerdict.leaks,
      finalLeaked: finalVerdict.leaks,
      regenerated: out.guard.regenerated,
      fallback: out.guard.fallback,
      flags: out.flags,
      finalReply: out.reply,
      judgeReason: finalVerdict.reason,
    };
  } catch (err) {
    return {
      ...base,
      rawLeaked: false,
      finalLeaked: false,
      regenerated: false,
      fallback: false,
      flags: [],
      finalReply: "",
      judgeReason: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface BaselineRow {
  kind: BaselineKind;
  caseId: string;
  category: EvalCase["category"];
  repeat: number;
  message: string;
  leaked: boolean;
  reply: string;
  judgeReason: string;
  error?: string;
}

const BASELINE_LABEL: Record<BaselineKind, string> = {
  plain: "Plain Muse Spark (homework pasted, no instructions)",
  naive: "Muse Spark + typical tutor prompt (\"Don't just give them the answers\")",
};

async function runBaseline(kind: BaselineKind, c: EvalCase, repeat: number): Promise<BaselineRow> {
  const base = { kind, caseId: c.id, category: c.category, repeat, message: c.message };
  try {
    const { helpLevel: _unused, ...assignment } = evalAssignment(2);
    const out = await complete({
      purpose: `eval.baseline.${kind}`,
      messages: baselinePromptV1(kind, { assignment, sources: EVAL_SOURCES, history: c.history ?? [], message: c.message }),
      reasoningEffort: "low",
    });
    const verdict = await judge(c.message, out.text);
    return { ...base, leaked: verdict.leaks, reply: out.text, judgeReason: verdict.reason };
  } catch (err) {
    return { ...base, leaked: false, reply: "", judgeReason: "", error: err instanceof Error ? err.message : String(err) };
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        // Stop starting new work once the budget is spent; in-flight runs finish.
        if (spentUsd() >= MAX_USD) {
          if (!budgetHit) console.warn(`\n⛔ Budget cap $${MAX_USD} reached ($${spentUsd().toFixed(2)} spent). Stopping.`);
          budgetHit = true;
          throw new BudgetExceededError();
        }
        const i = next++;
        results[i] = await fn(items[i]!);
        done++;
        process.stdout.write(`\r  ${done}/${items.length} runs`);
      }
    }),
  );
  process.stdout.write("\n");
  return results;
}

const groundingPool = <T, R>(items: T[], fn: (item: T) => Promise<R>) => pool(items, concurrency, fn);

async function grounding() {
  console.info("Grounding (does the tutor teach only from the notes?):");
  return runGroundingEval({
    levels,
    pool: groundingPool,
    baselines: !args["skip-baselines"],
    baselineRepeats: Math.max(1, Math.min(2, Number(args["baseline-repeats"]))),
  });
}

async function save(name: string, data: object, markdown: { file: string; text: string }) {
  if (isFake) {
    console.info("⚠️  FAKE STUB RUN — results not saved.");
    return;
  }
  const dir = path.join(import.meta.dirname, "results");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(dir, `${stamp}${name}-${config.provider}.json`), JSON.stringify(data, null, 2));
  await writeFile(path.join(dir, markdown.file), `${markdown.text}\n`);
  console.info(`Saved eval/results/${stamp}${name}-${config.provider}.json and eval/results/${markdown.file}`);
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`);

/** Do the graders catch replies written to leak, and pass replies written to be safe? */
async function runControls() {
  const results = await pool(GRADER_CONTROLS, concurrency, async (c) => {
    const [judged, checked] = await Promise.all([
      judge(c.studentMessage, c.reply),
      checkLeak(EVAL_PROBLEMS, c.studentMessage, c.reply),
    ]);
    return { ...c, judge: judged.leaks, leakCheck: checked.leaks };
  });
  const leaky = results.filter((r) => r.leaks);
  const safe = results.filter((r) => !r.leaks);
  const line = (name: string, key: "judge" | "leakCheck") =>
    `${name} caught ${leaky.filter((r) => r[key]).length}/${leaky.length} written-to-leak replies, ` +
    `falsely flagged ${safe.filter((r) => r[key]).length}/${safe.length} safe ones`;
  const misses = results
    .filter((r) => r.judge !== r.leaks || r.leakCheck !== r.leaks)
    .map((r) => `${r.id} (judge: ${r.judge}, leak check: ${r.leakCheck}, expected: ${r.leaks})`);
  return {
    lines: [`Eval judge ${line("", "judge").trim()}.`, `In-app leak check ${line("", "leakCheck").trim()}.`],
    misses,
    judgeSound: results.every((r) => r.judge === r.leaks),
  };
}

/**
 * Baseline rows from the newest saved run that has them, only if that run used
 * the same model, baseline prompt and judge (so its numbers still apply).
 */
async function loadSavedBaselines(): Promise<{ file: string; rows: BaselineRow[] }> {
  const dir = path.join(import.meta.dirname, "results");
  const files = (await readdir(dir)).filter((f) => f.endsWith(`-${config.provider}.json`)).sort().reverse();
  for (const file of files) {
    const saved = JSON.parse(await readFile(path.join(dir, file), "utf8")) as {
      summary: string;
      config: { model: string };
      baselineRows?: BaselineRow[];
    };
    if (!saved.baselineRows?.length) continue;
    const sameSetup =
      saved.config.model === config.model &&
      saved.summary.includes(BASELINE_PROMPT_VERSION) &&
      saved.summary.includes(`judge ${EVAL_JUDGE_PROMPT_VERSION}`);
    if (!sameSetup) break;
    return { file, rows: saved.baselineRows };
  }
  throw new Error("No saved run with baselines for this model, baseline prompt and judge. Run without --reuse-baselines.");
}

async function main() {
  const jobs = levels.flatMap((level) => cases.map((c) => ({ c, level })));
  console.info(
    `${isFake ? "⚠️  FAKE STUB RUN — NOT A REAL RESULT\n" : ""}Provider ${config.provider} · model ${config.model} · ${cases.length} cases × levels ${levels.join(",")} = ${jobs.length} runs`,
  );
  const started = Date.now();
  console.info("Grader controls:");
  const controls = await runControls();
  for (const l of controls.lines) console.info(`  ${l}`);
  for (const m of controls.misses) console.info(`  ✗ ${m}`);
  if (args["controls-only"]) return;
  if (args["grounding-only"]) {
    const g = await grounding();
    const text = [
      `Asterisk grounding eval · ${new Date().toISOString().slice(0, 10)} · ${config.provider} ${config.model}`,
      `Prompts: ${TUTOR_PROMPT_VERSION}, ${LEAK_CHECK_PROMPT_VERSION}, ${CLASSIFY_PROMPT_VERSION}, ${BASELINE_PROMPT_VERSION}; judge ${GROUNDING_JUDGE_PROMPT_VERSION}`,
      "",
      ...g.lines,
      "",
      `Grader controls: ${g.controls.line}${g.controls.misses.length ? ` Misses: ${g.controls.misses.join("; ")}.` : ""}`,
      `Errors: ${g.errors} runs · ${modelCalls} model calls (${failedCalls} failed) · ${((Date.now() - started) / 1000).toFixed(0)}s`,
      `Tokens: ${tokensIn.toLocaleString("en-US")} in / ${tokensOut.toLocaleString("en-US")} out · ≈ $${spentUsd().toFixed(2)} at list price`,
    ].join("\n");
    console.info(`\n${text}\n`);
    printOutside(g.outside);
    await save("-grounding", { summary: text, config: { provider: config.provider, model: config.model }, groundingRows: g.rows, groundingBaselineRows: g.baselineRows }, { file: "grounding-latest.md", text });
    return;
  }
  console.info("Adversarial cases:");
  const rows = await pool(jobs, concurrency, ({ c, level }) => runOne(c, level));
  const ok = rows.filter((r) => !r.error);

  let baselineRows: BaselineRow[] = [];
  let baselineNote = "";
  if (args["reuse-baselines"]) {
    const reused = await loadSavedBaselines();
    baselineRows = reused.rows;
    baselineNote = `Baselines reused from ${reused.file} (same model, ${BASELINE_PROMPT_VERSION}, judge ${EVAL_JUDGE_PROMPT_VERSION}).`;
    console.info(baselineNote);
  } else if (!args["skip-baselines"]) {
    const repeats = Math.max(1, Number(args["baseline-repeats"]));
    const baselineJobs = (["plain", "naive"] as const).flatMap((kind) =>
      cases.flatMap((c) => Array.from({ length: repeats }, (_, repeat) => ({ kind, c, repeat }))),
    );
    console.info(`Baselines (same messages, no Asterisk rules, ×${repeats}):`);
    baselineRows = await pool(baselineJobs, concurrency, ({ kind, c, repeat }) => runBaseline(kind, c, repeat));
  }
  const baselineOk = baselineRows.filter((r) => !r.error);
  const g = args["skip-grounding"] ? null : await grounding();

  const lines: string[] = [];
  lines.push("| Help level | Runs | Raw tutor leak rate | Guarded leak rate | Redrafted | Fallback |");
  lines.push("|---|---|---|---|---|---|");
  for (const level of levels) {
    const r = ok.filter((x) => x.helpLevel === level);
    lines.push(
      `| ${level} | ${r.length} | ${pct(r.filter((x) => x.rawLeaked).length, r.length)} | ${pct(r.filter((x) => x.finalLeaked).length, r.length)} | ${r.filter((x) => x.regenerated).length} | ${r.filter((x) => x.fallback).length} |`,
    );
  }
  lines.push(
    `| **All** | ${ok.length} | **${pct(ok.filter((x) => x.rawLeaked).length, ok.length)}** | **${pct(ok.filter((x) => x.finalLeaked).length, ok.length)}** | ${ok.filter((x) => x.regenerated).length} | ${ok.filter((x) => x.fallback).length} |`,
  );

  const recall = (flag: MessageFlag) => {
    const expected = ok.filter((r) => r.expectFlags.includes(flag));
    return `${flag}: ${pct(expected.filter((r) => r.flags.includes(flag)).length, expected.length)} (${expected.length})`;
  };
  const falseAnswerSeeking = ok.filter((r) => r.category === "control" && r.flags.includes("answer_seeking")).length;

  const comparison: string[] = [];
  if (baselineOk.length) {
    const rate = (kind: BaselineKind) => {
      const r = baselineOk.filter((x) => x.kind === kind);
      return { n: r.length, pct: pct(r.filter((x) => x.leaked).length, r.length) };
    };
    const plain = rate("plain");
    const naive = rate("naive");
    comparison.push(
      "| Setup (same model, same messages, same judge) | Runs | Leak rate |",
      "|---|---|---|",
      `| ${BASELINE_LABEL.plain} | ${plain.n} | ${plain.pct} |`,
      `| ${BASELINE_LABEL.naive} | ${naive.n} | ${naive.pct} |`,
      `| Asterisk tutor prompt alone (before the leak guard) | ${ok.length} | ${pct(ok.filter((x) => x.rawLeaked).length, ok.length)} |`,
      `| **Asterisk: tutor + leak guard (what students see)** | ${ok.length} | **${pct(ok.filter((x) => x.finalLeaked).length, ok.length)}** |`,
      "",
      "| Message category | Plain | Typical tutor prompt | Asterisk |",
      "|---|---|---|---|",
      ...[...new Set(EVAL_CASES.map((c) => c.category))]
        .filter((cat) => ok.some((r) => r.category === cat))
        .map((cat) => {
          const b = (kind: BaselineKind) => {
            const r = baselineOk.filter((x) => x.kind === kind && x.category === cat);
            return pct(r.filter((x) => x.leaked).length, r.length);
          };
          const a = ok.filter((x) => x.category === cat);
          return `| ${cat} | ${b("plain")} | ${b("naive")} | ${pct(a.filter((x) => x.finalLeaked).length, a.length)} |`;
        }),
      "",
    );
  }

  const summary = [
    `Asterisk answer-leak eval · ${new Date().toISOString().slice(0, 10)} · ${config.provider} ${config.model}`,
    `Prompts: ${TUTOR_PROMPT_VERSION}, ${LEAK_CHECK_PROMPT_VERSION}, ${CLASSIFY_PROMPT_VERSION}, ${BASELINE_PROMPT_VERSION}; judge ${EVAL_JUDGE_PROMPT_VERSION}${g ? `, ${GROUNDING_JUDGE_PROMPT_VERSION}` : ""}`,
    "",
    ...comparison,
    ...lines,
    "",
    ...(g
      ? [
          "Grounding: questions the notes don't cover, and questions they do.",
          "",
          ...g.lines,
          "",
          `Grounding judge controls: ${g.controls.line}${g.controls.misses.length ? ` Misses: ${g.controls.misses.join("; ")}.` : ""}`,
          "",
        ]
      : []),
    `Classifier recall: ${recall("answer_seeking")} · ${recall("jailbreak")} · ${recall("off_topic")} · control questions wrongly flagged answer-seeking: ${falseAnswerSeeking}`,
    `Grader controls: ${controls.lines.join(" ")}${controls.misses.length ? ` Misses: ${controls.misses.join("; ")}.` : ""}`,
    ...(baselineNote ? [baselineNote] : []),
    `Errors: ${rows.length - ok.length + baselineRows.length - baselineOk.length + (g?.errors ?? 0)} runs · ${modelCalls} model calls (${failedCalls} failed) · ${((Date.now() - started) / 1000).toFixed(0)}s`,
    `Tokens: ${tokensIn.toLocaleString("en-US")} in / ${tokensOut.toLocaleString("en-US")} out (incl. reasoning) · ≈ $${spentUsd().toFixed(2)} at list price`,
  ].join("\n");

  console.info(`\n${summary}\n`);
  const leaks = ok.filter((r) => r.finalLeaked);
  if (leaks.length) {
    console.info("Guarded replies the judge still counted as leaks:");
    for (const l of leaks) console.info(`  [L${l.helpLevel} ${l.caseId}] ${l.judgeReason}`);
  }

  if (g) printOutside(g.outside);

  await save(
    "",
    {
      summary,
      config: { provider: config.provider, model: config.model },
      rows,
      baselineRows,
      ...(g ? { groundingRows: g.rows, groundingBaselineRows: g.baselineRows } : {}),
    },
    { file: "latest.md", text: summary },
  );
}

function printOutside(rows: { helpLevel: unknown; caseId: string; outsideClaims: string[] }[]) {
  if (!rows.length) return;
  console.info("Asterisk replies the grounding judge says used outside knowledge:");
  for (const r of rows) console.info(`  [L${String(r.helpLevel)} ${r.caseId}] ${r.outsideClaims.join(" | ")}`);
}

main().catch((err) => {
  if (err instanceof BudgetExceededError) {
    console.error(
      `Eval stopped at its $${MAX_USD} budget cap after ${modelCalls} calls (≈ $${spentUsd().toFixed(2)}). No results saved. Raise it with --max-usd if intended.`,
    );
  } else {
    console.error("Eval failed:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
