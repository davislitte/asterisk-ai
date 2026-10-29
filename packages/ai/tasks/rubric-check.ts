import { type RubricCheckInput, type RubricCheckOutput, RubricCheckOutput as Output, rubricCheckPromptV1 } from "../prompts/rubric-check";
import { completeJson } from "../provider/client";
import { type GuardOutcome, checkLeak } from "./guarded-tutor";

/**
 * S6: rubric pre-check with the same guard loop as chat:
 * grade → feedback-mode leak check → strict regrade → leak check → generic fallback text.
 * Levels and points are derived here from the teacher's rubric, never trusted from the model.
 */

export interface RubricCheckCriterionResult {
  name: string;
  level: string;
  points: number;
  maxPoints: number;
  strengths: string;
  nextStep: string;
}

export interface RubricCheckResultData {
  criteria: RubricCheckCriterionResult[];
  totalPoints: number;
  maxPoints: number;
  overall: string;
  guard: GuardOutcome;
}

const FALLBACK_STRENGTHS = "You've started this part.";
const FALLBACK_NEXT_STEP =
  "Compare this part of your work with the matching section of your notes, and check each answer by substituting it back into the original equation.";
const FALLBACK_OVERALL = "Go through each criterion with your notes before you submit. You've got this.";

async function grade(input: RubricCheckInput): Promise<RubricCheckOutput> {
  const result = await completeJson({
    purpose: "rubric.check",
    messages: rubricCheckPromptV1(input),
    schemaName: "rubric_check",
    schema: Output,
    // Measured with `bench:rubric` (rubric-check@2): minimal grades as accurately as
    // medium on drafts with known levels, in about a fifth of the time.
    reasoningEffort: "minimal",
  });
  return result.data;
}

function normalize(output: RubricCheckOutput, input: RubricCheckInput): Omit<RubricCheckResultData, "guard"> {
  const byId = new Map(output.criteria.map((c) => [c.id.trim().replace(/^\[|\]$/g, "").toUpperCase(), c]));
  const criteria = input.criteria.map((criterion, i) => {
    const levels = [...criterion.levels].sort((a, b) => b.points - a.points);
    const lowest = levels.at(-1)!;
    const maxPoints = levels[0]!.points;
    const graded = byId.get(`C${i + 1}`);
    if (!graded) {
      return { name: criterion.name, level: lowest.label, points: lowest.points, maxPoints, strengths: "", nextStep: FALLBACK_NEXT_STEP };
    }
    const wanted = graded.level.trim().toLowerCase();
    const level =
      levels.find((l) => l.label.trim().toLowerCase() === wanted) ??
      levels.find((l) => wanted.startsWith(l.label.trim().toLowerCase())) ??
      lowest;
    return {
      name: criterion.name,
      level: level.label,
      points: level.points,
      maxPoints,
      strengths: graded.strengths.trim(),
      nextStep: graded.nextStep.trim(),
    };
  });
  return {
    criteria,
    totalPoints: criteria.reduce((n, c) => n + c.points, 0),
    maxPoints: criteria.reduce((n, c) => n + c.maxPoints, 0),
    overall: output.overall.trim(),
  };
}

const feedbackText = (r: Omit<RubricCheckResultData, "guard">) =>
  [...r.criteria.flatMap((c) => [`${c.name}: ${c.strengths}`, c.nextStep]), r.overall].join("\n");

export async function rubricCheck(input: RubricCheckInput): Promise<RubricCheckResultData> {
  const guard: GuardOutcome = { leakDetected: false, regenerated: false, fallback: false, leakedProblemIds: [] };

  const first = normalize(await grade(input), input);
  const verdict1 = await checkLeak(input.problems, input.draft, feedbackText(first), "feedback");
  if (!verdict1.leaks) return { ...first, guard };

  guard.leakDetected = true;
  guard.regenerated = true;
  guard.leakedProblemIds = verdict1.problemIds;
  const second = normalize(await grade({ ...input, strict: true }), input);
  const verdict2 = await checkLeak(input.problems, input.draft, feedbackText(second), "feedback");
  if (!verdict2.leaks) return { ...second, guard };

  // Keep the levels (the teacher enabled scoring) but replace every word of feedback.
  guard.fallback = true;
  guard.leakedProblemIds = [...new Set([...verdict1.problemIds, ...verdict2.problemIds])];
  return {
    ...second,
    criteria: second.criteria.map((c) => ({ ...c, strengths: FALLBACK_STRENGTHS, nextStep: FALLBACK_NEXT_STEP })),
    overall: FALLBACK_OVERALL,
    guard,
  };
}
