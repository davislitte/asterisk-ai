/**
 * `pnpm --filter @asterisk/ai bench:rubric` — how fast can the rubric
 * pre-check (S6) grade without grading worse?
 *
 * 1. Grading: four drafts of the demo assignment written with the rubric level
 *    a teacher would give each criterion. Each effort grades each draft; we
 *    report how often it lands within one level of the expected level, total
 *    points, and latency.
 * 2. Feedback leak check: hand-written rubric feedback, some leaking answers
 *    (corrected factorizations, missing roots) and some safe, through the
 *    feedback-mode leak check at each effort.
 *
 * Options: --efforts minimal,low,medium   --repeats N (default 2)
 *          --concurrency N (default 6)   --max-usd N (default 2)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { LeakVerdict, leakCheckPromptV1 } from "../prompts/guard";
import { RUBRIC_CHECK_PROMPT_VERSION, RubricCheckOutput, rubricCheckPromptV1 } from "../prompts/rubric-check";
import { type ReasoningEffort, completeJson } from "../provider/client";
import { resolveProviderConfig } from "../provider/config";
import { estimateUsd } from "../provider/pricing";
import { setModelCallLogger } from "../provider/logging";
import { EVAL_PROBLEMS, EVAL_RUBRIC, evalAssignment } from "./fixture";

const { values: args } = parseArgs({
  options: {
    efforts: { type: "string", default: "minimal,low,medium" },
    repeats: { type: "string", default: "2" },
    concurrency: { type: "string", default: "6" },
    "max-usd": { type: "string", default: "2" },
  },
});

const config = resolveProviderConfig();
if (config.provider === "FAKE") {
  console.error("Refusing to run on the FAKE stub: latency and grades would be meaningless.");
  process.exit(1);
}

const efforts = args.efforts.split(",").map((e) => e.trim()) as ReasoningEffort[];
const repeats = Math.max(1, Number(args.repeats));
const concurrency = Math.max(1, Number(args.concurrency));
const MAX_USD = Number(args["max-usd"]);

let tokensIn = 0;
let tokensOut = 0;
setModelCallLogger((e) => {
  tokensIn += e.tokensIn ?? 0;
  tokensOut += e.tokensOut ?? 0;
});
const spentUsd = () => estimateUsd(tokensIn, tokensOut);

interface Draft {
  id: string;
  text: string;
  /** Expected level label per criterion, in rubric order. */
  expected: string[];
}

const SIGN_ERROR_DRAFT = [
  "Problem 1: x^2 - 5x + 6 = 0 factors to (x + 2)(x + 3) = 0, so x = -2 or x = -3.",
  "Problem 2: x^2 + 2x - 15 = 0 factors to (x - 5)(x + 3) = 0, so x = 5 or x = -3.",
  "Problem 3: 2x^2 - 8x = 0. I divided both sides by x to get 2x - 8 = 0, so x = 4.",
  "Problem 4: (x - 3)(x + 3) = 0 so x = 3 or x = -3. I checked: 9 - 9 = 0.",
  "Problem 5: w(w + 3) = 40 -> w^2 + 3w - 40 = 0 -> (w + 8)(w - 5) = 0 -> w = -8 or w = 5. The width is 5 because a width can't be negative.",
].join("\n");

const DRAFTS: Draft[] = [
  {
    id: "strong",
    expected: ["Exemplary", "Exemplary", "Exemplary", "Exemplary"],
    text: [
      "Problem 1: x^2 - 5x + 6 = 0. I need two numbers that multiply to 6 and add to -5: -2 and -3. So (x - 2)(x - 3) = 0. By the zero product property, x - 2 = 0 or x - 3 = 0, so x = 2 or x = 3. Check: 4 - 10 + 6 = 0 and 9 - 15 + 6 = 0.",
      "Problem 2: x^2 + 2x - 15 = 0. Numbers that multiply to -15 and add to 2: 5 and -3. (x + 5)(x - 3) = 0, so x = -5 or x = 3. Check: 25 - 10 - 15 = 0 and 9 + 6 - 15 = 0.",
      "Problem 3: 2x^2 - 8x = 0. Common factor 2x first: 2x(x - 4) = 0, so x = 0 or x = 4. Check: 0 - 0 = 0 and 32 - 32 = 0.",
      "Problem 4: x^2 - 9 = 0 is a difference of squares: (x - 3)(x + 3) = 0, so x = 3 or x = -3. Check: 9 - 9 = 0 for both roots.",
      "Problem 5: Let w be the width in cm, so the length is w + 3. Area: w(w + 3) = 40, so w^2 + 3w - 40 = 0. (w + 8)(w - 5) = 0, so w = -8 or w = 5. A width can't be negative, so I reject -8. The width is 5 cm (length 8 cm, and 5 x 8 = 40).",
    ].join("\n\n"),
  },
  {
    id: "one-root",
    expected: ["Exemplary", "Developing", "Beginning", "Developing"],
    text: [
      "1) x^2 - 5x + 6 = 0 -> (x - 2)(x - 3) = 0 -> x = 2",
      "2) x^2 + 2x - 15 = 0 -> (x + 5)(x - 3) = 0 -> x = 3",
      "3) 2x^2 - 8x = 0 -> 2x(x - 4) = 0 -> x = 4",
      "4) x^2 - 9 = 0 -> (x - 3)(x + 3) = 0 -> x = 3",
      "5) w(w + 3) = 40 -> w^2 + 3w - 40 = 0 -> (w + 8)(w - 5) = 0 -> w = 5 cm",
    ].join("\n"),
  },
  {
    id: "answers-only",
    expected: ["Beginning", "Exemplary", "Beginning", "Beginning"],
    text: ["1. x = 2, x = 3", "2. x = 3, x = -5", "3. x = 0, x = 4", "4. x = 3, x = -3", "5. width = 5 cm"].join("\n"),
  },
  {
    id: "sign-errors",
    expected: ["Developing", "Beginning", "Developing", "Proficient"],
    text: SIGN_ERROR_DRAFT,
  },
];

/** Feedback on the sign-errors draft, written to leak or to be safe. */
const FEEDBACK_CONTROLS = [
  { id: "leak-corrected", leaks: true, reply: "Your factoring of problem 1 has the signs flipped; it should be (x - 2)(x - 3) = 0." },
  { id: "leak-missing-root", leaks: true, reply: "On problem 3 you lost a root when you divided by x. The missing one is x = 0." },
  { id: "leak-correct-roots", leaks: true, reply: "For problem 2 the correct roots are 3 and -5, so recheck your factors." },
  { id: "leak-flip-hint", leaks: true, reply: "In problem 1 both signs are flipped, so just make each of your answers positive and you're done." },
  { id: "safe-wrong", leaks: false, reply: "Your answers on problem 1 aren't right yet. Substitute each one into the original equation to see what goes wrong." },
  { id: "safe-method", leaks: false, reply: "On problem 3, dividing both sides by x can lose a solution. Revisit the notes on taking out a common factor first." },
  { id: "safe-praise", leaks: false, reply: "Nice work checking problem 4 and explaining why you rejected the negative width in problem 5." },
];

const levelIndex = (criterion: number, label: string) => {
  const levels = EVAL_RUBRIC[criterion]!.levels;
  const wanted = label.trim().toLowerCase();
  const i = levels.findIndex((l) => l.label.toLowerCase() === wanted || wanted.startsWith(l.label.toLowerCase()));
  return i === -1 ? levels.length - 1 : i;
};
const expectedPoints = (d: Draft) => d.expected.reduce((n, l, i) => n + EVAL_RUBRIC[i]!.levels[levelIndex(i, l)]!.points, 0);

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

interface Graded {
  draft: Draft;
  levels: string[];
  points: number;
  latencyMs: number;
  tokensOut: number;
  feedback: string;
}

async function grade(effort: ReasoningEffort, draft: Draft): Promise<Graded | null> {
  if (spentUsd() >= MAX_USD) return null;
  const assignment = evalAssignment(2);
  try {
    const result = await completeJson({
      purpose: "bench.rubric_check",
      messages: rubricCheckPromptV1({ assignment, problems: EVAL_PROBLEMS, criteria: EVAL_RUBRIC, draft: draft.text }),
      schemaName: "rubric_check",
      schema: RubricCheckOutput,
      reasoningEffort: effort,
    });
    const byId = new Map(result.data.criteria.map((c) => [c.id.trim().replace(/^\[|\]$/g, "").toUpperCase(), c]));
    const levels = EVAL_RUBRIC.map((c, i) => {
      const got = byId.get(`C${i + 1}`);
      return c.levels[got ? levelIndex(i, got.level) : c.levels.length - 1]!.label;
    });
    return {
      draft,
      levels,
      points: levels.reduce((n, l, i) => n + EVAL_RUBRIC[i]!.levels[levelIndex(i, l)]!.points, 0),
      latencyMs: result.latencyMs,
      tokensOut: result.usage.tokensOut ?? 0,
      feedback: [...result.data.criteria.map((c) => `${c.id}: ${c.strengths} ${c.nextStep}`), result.data.overall].join("\n"),
    };
  } catch (err) {
    console.error(`  ${effort} ${draft.id}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function checkFeedback(effort: ReasoningEffort, control: (typeof FEEDBACK_CONTROLS)[number]) {
  if (spentUsd() >= MAX_USD) return null;
  try {
    const result = await completeJson({
      purpose: "bench.leak_check_feedback",
      messages: leakCheckPromptV1({ problems: EVAL_PROBLEMS, studentMessage: SIGN_ERROR_DRAFT,reply: control.reply, mode: "feedback" }),
      schemaName: "leak_verdict",
      schema: LeakVerdict,
      reasoningEffort: effort,
    });
    return { control, flagged: result.data.leaks, latencyMs: result.latencyMs };
  } catch (err) {
    console.error(`  ${effort} ${control.id}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

async function main() {
  console.log(
    `Rubric-check bench: ${config.provider}/${config.model}, ${RUBRIC_CHECK_PROMPT_VERSION}, ${DRAFTS.length} drafts x ${repeats}, ` +
      `${FEEDBACK_CONTROLS.length} feedback controls x ${repeats}, efforts ${efforts.join(", ")}`,
  );
  const gradeLines = [
    "| Effort | Criteria within one level of expected | Exact level | Points per draft (expected " +
      DRAFTS.map((d) => `${d.id} ${expectedPoints(d)}`).join(", ") +
      ") | p50 latency | p90 latency | Avg output tokens |",
    "|---|---|---|---|---|---|---|",
  ];
  const leakLines = [
    "| Effort | Leaky feedback caught | Safe feedback falsely flagged | p50 latency |",
    "|---|---|---|---|",
  ];
  const samples: string[] = [];
  const misses: string[] = [];

  for (const effort of efforts) {
    const jobs = DRAFTS.flatMap((d) => Array.from({ length: repeats }, () => d));
    const graded = (await pool(jobs, (d) => grade(effort, d))).filter((g): g is Graded => g !== null);
    let within = 0;
    let exact = 0;
    let total = 0;
    for (const g of graded) {
      g.levels.forEach((l, i) => {
        const diff = Math.abs(levelIndex(i, l) - levelIndex(i, g.draft.expected[i]!));
        total++;
        if (diff <= 1) within++;
        if (diff === 0) exact++;
        else misses.push(`${effort} · ${g.draft.id} · ${EVAL_RUBRIC[i]!.name}: ${l} (expected ${g.draft.expected[i]})`);
      });
    }
    const pointsByDraft = DRAFTS.map((d) => {
      const pts = graded.filter((g) => g.draft === d).map((g) => g.points);
      return `${d.id} ${pts.join("/") || "-"}`;
    }).join(", ");
    const latencies = graded.map((g) => g.latencyMs);
    const avgOut = graded.length ? Math.round(graded.reduce((n, g) => n + g.tokensOut, 0) / graded.length) : 0;
    gradeLines.push(
      `| ${effort} | ${within}/${total} | ${exact}/${total} | ${pointsByDraft} | ${secs(quantile(latencies, 0.5))} | ${secs(quantile(latencies, 0.9))} | ${avgOut} |`,
    );
    console.log(gradeLines.at(-1));
    const sample = graded.find((g) => g.draft.id === "sign-errors");
    if (sample) samples.push(`### ${effort}: sign-errors draft (${sample.levels.join(", ")})\n\n${sample.feedback}`);

    const checks = (
      await pool(
        FEEDBACK_CONTROLS.flatMap((c) => Array.from({ length: repeats }, () => c)),
        (c) => checkFeedback(effort, c),
      )
    ).filter((c) => c !== null);
    const leaky = checks.filter((c) => c.control.leaks);
    const safe = checks.filter((c) => !c.control.leaks);
    const missed = leaky.filter((c) => !c.flagged).map((c) => c.control.id);
    leakLines.push(
      `| ${effort} | ${leaky.length - missed.length}/${leaky.length}${missed.length ? ` (missed ${[...new Set(missed)].join(", ")})` : ""} | ` +
        `${safe.filter((c) => c.flagged).length}/${safe.length} | ${secs(quantile(checks.map((c) => c.latencyMs), 0.5))} |`,
    );
    console.log(leakLines.at(-1));
  }

  const report = [
    "# Rubric pre-check effort bench",
    "",
    `${config.provider}/${config.model} · ${RUBRIC_CHECK_PROMPT_VERSION} · ${DRAFTS.length} drafts × ${repeats} with expected levels · ${FEEDBACK_CONTROLS.length} feedback controls × ${repeats}`,
    "",
    "## Grading",
    "",
    ...gradeLines,
    "",
    misses.length ? `Levels that differed from expected:\n\n${misses.map((m) => `- ${m}`).join("\n")}` : "Every level matched.",
    "",
    "## Feedback-mode leak check",
    "",
    ...leakLines,
    "",
    `≈ $${spentUsd().toFixed(2)} at list price${spentUsd() >= MAX_USD ? ` (stopped at the --max-usd ${MAX_USD} cap)` : ""}`,
    "",
    "## Sample feedback (unchecked)",
    "",
    ...samples.flatMap((s) => [s, ""]),
  ].join("\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(import.meta.dirname, "results", `rubric-bench-${stamp}.md`), report);
  console.log(`${misses.join("\n")}\n≈ $${spentUsd().toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
