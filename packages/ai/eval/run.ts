/**
 * `pnpm eval` — adversarial answer-leak eval (CLAUDE.md §6).
 *
 * For every case × help level it runs the full guarded pipeline, then an
 * independent judge grades both the raw tutor draft and the final reply the
 * student would see. Reports raw vs guarded leak rate per help level, guard
 * actions, and classifier recall.
 *
 * Options: --levels 1,2,3,4   --limit N   --concurrency N   --allow-fake
 * Refuses to run on the FAKE stub unless --allow-fake, and never saves FAKE results.
 */
import type { HelpLevel, MessageFlag } from "@asterisk/shared";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { EVAL_JUDGE_PROMPT_VERSION, evalJudgePromptV1 } from "../prompts/eval-judge";
import { CLASSIFY_PROMPT_VERSION, LEAK_CHECK_PROMPT_VERSION, LeakVerdict } from "../prompts/guard";
import { TUTOR_PROMPT_VERSION } from "../prompts/tutor";
import { completeJson } from "../provider/client";
import { resolveProviderConfig } from "../provider/config";
import { setModelCallLogger } from "../provider/logging";
import { guardedTutorReply } from "../tasks/guarded-tutor";
import { type EvalCase, EVAL_CASES } from "./cases";
import { EVAL_ANSWER_KEYS, EVAL_PROBLEMS, EVAL_SOURCES, evalAssignment } from "./fixture";

const { values: args } = parseArgs({
  options: {
    levels: { type: "string", default: "1,2,3,4" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "allow-fake": { type: "boolean", default: false },
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
setModelCallLogger((e) => {
  modelCalls++;
  if (!e.ok) failedCalls++;
});
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

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
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

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`);

async function main() {
  const jobs = levels.flatMap((level) => cases.map((c) => ({ c, level })));
  console.info(
    `${isFake ? "⚠️  FAKE STUB RUN — NOT A REAL RESULT\n" : ""}Provider ${config.provider} · model ${config.model} · ${cases.length} cases × levels ${levels.join(",")} = ${jobs.length} runs`,
  );
  const started = Date.now();
  const rows = await pool(jobs, concurrency, ({ c, level }) => runOne(c, level));
  const ok = rows.filter((r) => !r.error);

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

  const summary = [
    `Asterisk answer-leak eval · ${new Date().toISOString().slice(0, 10)} · ${config.provider} ${config.model}`,
    `Prompts: ${TUTOR_PROMPT_VERSION}, ${LEAK_CHECK_PROMPT_VERSION}, ${CLASSIFY_PROMPT_VERSION}; judge ${EVAL_JUDGE_PROMPT_VERSION}`,
    "",
    ...lines,
    "",
    `Classifier recall: ${recall("answer_seeking")} · ${recall("jailbreak")} · ${recall("off_topic")} · control questions wrongly flagged answer-seeking: ${falseAnswerSeeking}`,
    `Errors: ${rows.length - ok.length} runs · ${modelCalls} model calls (${failedCalls} failed) · ${((Date.now() - started) / 1000).toFixed(0)}s`,
  ].join("\n");

  console.info(`\n${summary}\n`);
  const leaks = ok.filter((r) => r.finalLeaked);
  if (leaks.length) {
    console.info("Guarded replies the judge still counted as leaks:");
    for (const l of leaks) console.info(`  [L${l.helpLevel} ${l.caseId}] ${l.judgeReason}`);
  }

  if (isFake) {
    console.info("⚠️  FAKE STUB RUN — results not saved.");
    return;
  }
  const dir = path.join(import.meta.dirname, "results");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(dir, `${stamp}-${config.provider}.json`), JSON.stringify({ summary, config: { provider: config.provider, model: config.model }, rows }, null, 2));
  await writeFile(path.join(dir, "latest.md"), `${summary}\n`);
  console.info(`Saved eval/results/${stamp}-${config.provider}.json and eval/results/latest.md`);
}

main().catch((err) => {
  console.error("Eval failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
