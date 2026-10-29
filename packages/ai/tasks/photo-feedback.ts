import {
  PHOTO_STATUSES,
  PhotoFeedbackOutput,
  type PhotoFeedbackInput,
  PhotoReading,
  photoFeedbackPromptV1,
  photoReadPromptV1,
  readingText,
} from "../prompts/photo-feedback";
import { completeJson } from "../provider/client";
import { type GuardOutcome, checkLeak } from "./guarded-tutor";

/**
 * S5: read → feedback → feedback-mode leak check → strict redo → leak check →
 * generic fallback text. The photo goes only to the read step.
 */

export interface PhotoProblemResult {
  problemId: string;
  /** What Asterisk read, shown to the student so they can spot a misreading. */
  reading: string;
  status: (typeof PHOTO_STATUSES)[number];
  feedback: string;
}

export interface PhotoFeedbackResult {
  legible: boolean;
  problems: PhotoProblemResult[];
  overall: string;
  guard: GuardOutcome;
}

const FALLBACK_FEEDBACK =
  "Go through this problem step by step with your notes, and check each answer by substituting it into the original equation.";
const FALLBACK_OVERALL = "Check each problem against your notes, then compare with the work in your doc.";
export const UNREADABLE_MESSAGE =
  "I couldn't read the work in that photo. Try again in good light, with the page flat and filling the frame.";

export async function readPhoto(input: {
  problems: { id: string; prompt: string }[];
  imageDataUrl: string;
}): Promise<PhotoReading> {
  const result = await completeJson({
    purpose: "photo.read",
    messages: photoReadPromptV1(input),
    schemaName: "photo_reading",
    schema: PhotoReading,
    reasoningEffort: "low",
  });
  // Only assigned problems, in assignment order, each once.
  const byId = new Map(result.data.problems.map((p) => [p.problemId.trim().replace(/^problem\s*/i, ""), p.work.trim()]));
  return {
    legible: result.data.legible,
    problems: input.problems.flatMap((p) => {
      const work = byId.get(p.id);
      return work ? [{ problemId: p.id, work }] : [];
    }),
  };
}

async function feedback(input: PhotoFeedbackInput): Promise<PhotoFeedbackOutput> {
  const result = await completeJson({
    purpose: "photo.feedback",
    messages: photoFeedbackPromptV1(input),
    schemaName: "photo_feedback",
    schema: PhotoFeedbackOutput,
    reasoningEffort: "minimal",
  });
  return result.data;
}

function merge(reading: PhotoFeedbackInput["reading"], output: PhotoFeedbackOutput): PhotoProblemResult[] {
  const byId = new Map(output.problems.map((p) => [p.problemId.trim().replace(/^problem\s*/i, ""), p]));
  return reading.map((r) => {
    const fb = byId.get(r.problemId);
    return {
      problemId: r.problemId,
      reading: r.work,
      status: fb?.status ?? "revisit",
      feedback: fb?.feedback.trim() || FALLBACK_FEEDBACK,
    };
  });
}

const feedbackText = (problems: PhotoProblemResult[], overall: string) =>
  [...problems.map((p) => `Problem ${p.problemId}: ${p.feedback}`), overall].join("\n");

export async function photoFeedback(
  input: Omit<PhotoFeedbackInput, "reading" | "strict"> & { imageDataUrl: string },
): Promise<PhotoFeedbackResult> {
  const guard: GuardOutcome = { leakDetected: false, regenerated: false, fallback: false, leakedProblemIds: [] };
  const reading = await readPhoto({ problems: input.problems, imageDataUrl: input.imageDataUrl });
  if (!reading.legible || reading.problems.length === 0) {
    return { legible: false, problems: [], overall: UNREADABLE_MESSAGE, guard };
  }

  const work = readingText(reading.problems);
  const base = { assignment: input.assignment, problems: input.problems, reading: reading.problems };

  const first = await feedback(base);
  const firstProblems = merge(reading.problems, first);
  const verdict1 = await checkLeak(input.problems, work, feedbackText(firstProblems, first.overall), "feedback");
  if (!verdict1.leaks) return { legible: true, problems: firstProblems, overall: first.overall.trim(), guard };

  guard.leakDetected = true;
  guard.regenerated = true;
  guard.leakedProblemIds = verdict1.problemIds;
  const second = await feedback({ ...base, strict: true });
  const secondProblems = merge(reading.problems, second);
  const verdict2 = await checkLeak(input.problems, work, feedbackText(secondProblems, second.overall), "feedback");
  if (!verdict2.leaks) return { legible: true, problems: secondProblems, overall: second.overall.trim(), guard };

  // Keep what was read and the statuses; replace every word of feedback.
  guard.fallback = true;
  guard.leakedProblemIds = [...new Set([...verdict1.problemIds, ...verdict2.problemIds])];
  return {
    legible: true,
    problems: secondProblems.map((p) => ({ ...p, feedback: FALLBACK_FEEDBACK })),
    overall: FALLBACK_OVERALL,
    guard,
  };
}
