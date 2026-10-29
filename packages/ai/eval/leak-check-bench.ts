/**
 * `pnpm --filter @asterisk/ai bench:leak` — how fast can the answer-leak check
 * run without missing leaks?
 *
 * Replays replies from a saved `pnpm eval` run that the independent judge
 * (high effort) already labelled: leaky ones from the plain and typical-prompt
 * baselines, and safe ones from the baselines and Asterisk's final replies.
 * Runs the in-app leak check on the same sample at each reasoning effort and
 * reports recall on leaky replies, false alarms on safe ones, and latency.
 *
 * Options: --results <file> (default: newest run with baselines)
 *          --efforts minimal,low,medium   --per-class N (default 40)
 *          --concurrency N (default 6)   --max-usd N (default 3)
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { LEAK_CHECK_PROMPT_VERSION, LeakVerdict, leakCheckPromptV1 } from "../prompts/guard";
import { type ReasoningEffort, completeJson } from "../provider/client";
import { resolveProviderConfig } from "../provider/config";
import { estimateUsd } from "../provider/pricing";
import { setModelCallLogger } from "../provider/logging";
import { GRADER_CONTROLS } from "./controls";
import { EVAL_PROBLEMS } from "./fixture";

const { values: args } = parseArgs({
  options: {
    results: { type: "string" },
    efforts: { type: "string", default: "minimal,low,medium" },
    "per-class": { type: "string", default: "40" },
    concurrency: { type: "string", default: "6" },
    "max-usd": { type: "string", default: "3" },
  },
});

const config = resolveProviderConfig();
if (config.provider === "FAKE") {
  console.error("Refusing to run on the FAKE stub: latency and recall would be meaningless.");
  process.exit(1);
}

const RESULTS_DIR = path.join(import.meta.dirname, "results");
const efforts = args.efforts.split(",").map((e) => e.trim()) as ReasoningEffort[];
const perClass = Number(args["per-class"]);
const concurrency = Math.max(1, Number(args.concurrency));
const MAX_USD = Number(args["max-usd"]);
const CONTROL_REPEATS = 3;

let tokensIn = 0;
let tokensOut = 0;
setModelCallLogger((e) => {
  tokensIn += e.tokensIn ?? 0;
  tokensOut += e.tokensOut ?? 0;
});
const spentUsd = () => estimateUsd(tokensIn, tokensOut);

interface SavedRun {
  rows: { caseId: string; message: string; finalReply: string; finalLeaked: boolean }[];
  baselineRows?: { kind: string; caseId: string; repeat: number; message: string; reply: string; leaked: boolean }[];
}

interface Sample {
  id: string;
  message: string;
  reply: string;
  /** The eval judge's verdict. */
  leaks: boolean;
}

async function loadRun(): Promise<{ file: string; run: SavedRun }> {
  if (args.results) return { file: args.results, run: JSON.parse(await readFile(args.results, "utf8")) };
  const files = (await readdir(RESULTS_DIR)).filter((f) => f.endsWith(".json")).sort().reverse();
  for (const f of files) {
    const run = JSON.parse(await readFile(path.join(RESULTS_DIR, f), "utf8")) as SavedRun;
    if (run.baselineRows?.length) return { file: f, run };
  }
  throw new Error("No saved eval run with baselines. Run `pnpm eval` first.");
}

/** Stable pseudo-random order so reruns use the same sample. */
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildSample(run: SavedRun): Sample[] {
  const all: Sample[] = [
    ...(run.baselineRows ?? []).map((b) => ({
      id: `${b.kind}:${b.caseId}#${b.repeat}`,
      message: b.message,
      reply: b.reply,
      leaks: b.leaked,
    })),
    ...run.rows.map((r, i) => ({ id: `asterisk:${r.caseId}#${i}`, message: r.message, reply: r.finalReply, leaks: r.finalLeaked })),
  ].filter((s) => s.reply.trim());
  const pick = (leaks: boolean) => {
    const pool = all.filter((s) => s.leaks === leaks).sort((a, b) => stableHash(a.id) - stableHash(b.id));
    // Subtle leaks (from the typical-prompt baseline) are the hard cases, so take all of them first.
    const subtle = pool.filter((s) => s.id.startsWith("naive:"));
    return [...new Set([...(leaks ? subtle : []), ...pool])].slice(0, perClass);
  };
  return [...pick(true), ...pick(false)];
}

/** The hand-written subtle cases (hints, riddles, other languages, confirmations), each repeated. */
function controlSample(): Sample[] {
  return GRADER_CONTROLS.flatMap((c) =>
    Array.from({ length: CONTROL_REPEATS }, (_, r) => ({
      id: `control:${c.id}#${r}`,
      message: c.studentMessage,
      reply: c.reply,
      leaks: c.leaks,
    })),
  );
}

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

interface Outcome {
  sample: Sample;
  flagged: boolean | null;
  latencyMs: number;
  tokensOut: number;
}

async function runEffort(effort: ReasoningEffort, sample: Sample[]): Promise<Outcome[]> {
  return pool(sample, async (s) => {
    if (spentUsd() >= MAX_USD) return { sample: s, flagged: null, latencyMs: 0, tokensOut: 0 };
    try {
      const result = await completeJson({
        purpose: "bench.leak_check",
        messages: leakCheckPromptV1({ problems: EVAL_PROBLEMS, studentMessage: s.message, reply: s.reply, mode: "chat" }),
        schemaName: "leak_verdict",
        schema: LeakVerdict,
        reasoningEffort: effort,
      });
      return { sample: s, flagged: result.data.leaks, latencyMs: result.latencyMs, tokensOut: result.usage.tokensOut ?? 0 };
    } catch (err) {
      console.error(`  ${effort} ${s.id}: ${err instanceof Error ? err.message : String(err)}`);
      return { sample: s, flagged: null, latencyMs: 0, tokensOut: 0 };
    }
  });
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};

async function main() {
  const { file, run } = await loadRun();
  const replayed = buildSample(run);
  const controls = controlSample();
  const leaky = replayed.filter((s) => s.leaks).length;
  const setup =
    `${config.provider}/${config.model} · ${LEAK_CHECK_PROMPT_VERSION} · ${leaky} judge-labelled leaky + ${replayed.length - leaky} safe replies ` +
    `from \`${path.basename(file)}\` · ${GRADER_CONTROLS.length} hand-written controls × ${CONTROL_REPEATS}`;
  console.log(`Leak-check bench: ${setup} · efforts ${efforts.join(", ")}`);

  const caughtOf = (outs: Outcome[]) => {
    const leakyOut = outs.filter((o) => o.sample.leaks);
    const caught = leakyOut.filter((o) => o.flagged).length;
    return `${caught}/${leakyOut.length} (${pct(caught, leakyOut.length)})`;
  };
  const falseAlarmsOf = (outs: Outcome[]) => {
    const safeOut = outs.filter((o) => !o.sample.leaks);
    const flagged = safeOut.filter((o) => o.flagged).length;
    return `${flagged}/${safeOut.length}`;
  };

  const lines = [
    "| Effort | Replayed leaks caught | Subtle control leaks caught | False alarms (replayed · controls) | p50 latency | p90 latency | Avg output tokens |",
    "|---|---|---|---|---|---|---|",
  ];
  const misses: string[] = [];
  for (const effort of efforts) {
    const outcomes = (await runEffort(effort, [...replayed, ...controls])).filter((o) => o.flagged !== null);
    const replayOut = outcomes.filter((o) => !o.sample.id.startsWith("control:"));
    const controlOut = outcomes.filter((o) => o.sample.id.startsWith("control:"));
    const latencies = outcomes.map((o) => o.latencyMs);
    const avgOut = outcomes.length ? Math.round(outcomes.reduce((n, o) => n + o.tokensOut, 0) / outcomes.length) : 0;
    lines.push(
      `| ${effort} | ${caughtOf(replayOut)} | ${caughtOf(controlOut)} | ${falseAlarmsOf(replayOut)} · ${falseAlarmsOf(controlOut)} | ` +
        `${(quantile(latencies, 0.5) / 1000).toFixed(1)} s | ${(quantile(latencies, 0.9) / 1000).toFixed(1)} s | ${avgOut} |`,
    );
    for (const o of outcomes.filter((o) => o.sample.leaks && !o.flagged)) misses.push(`${effort} missed ${o.sample.id}`);
    console.log(lines.at(-1));
  }

  const report = [
    `# Leak-check effort bench`,
    "",
    setup,
    "",
    ...lines,
    "",
    misses.length ? `Missed leaks: ${misses.join("; ")}` : "No missed leaks.",
    "",
    `≈ $${spentUsd().toFixed(2)} at list price${spentUsd() >= MAX_USD ? ` (stopped at the --max-usd ${MAX_USD} cap)` : ""}`,
  ].join("\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(RESULTS_DIR, `leak-bench-${stamp}.md`), `${report}\n`);
  console.log(`\n${misses.length ? misses.join("\n") : "No missed leaks."}\n≈ $${spentUsd().toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
