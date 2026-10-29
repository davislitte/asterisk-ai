import type { MessageFlag } from "@asterisk/shared";
import {
  type ClassifyInput,
  type LeakCheckProblem,
  LeakVerdict,
  MessageClassification,
  classifyMessagePromptV1,
  leakCheckPromptV1,
} from "../prompts/guard";
import type { TutorContext } from "../prompts/tutor";
import { completeJson } from "../provider/client";
import { looksLikeInjection } from "./injection-patterns";
import { tutorReply } from "./tutor-reply";

/**
 * The guardrail pipeline around every tutor turn (CLAUDE.md §6):
 *
 *   classify(message) ─┐            (in parallel; flags go to the teacher monitor)
 *   tutor draft ───────┴─▶ leak check ─▶ ok ───────────────▶ reply
 *                                       └─ leak ─▶ strict redraft ─▶ leak check ─▶ ok ─▶ reply
 *                                                                              └─ leak ─▶ safe fallback
 *
 * The leak check fails closed: if it can't run, the error propagates and no
 * unchecked reply is shown. Classification fails open (no flags), because a
 * missing flag only affects the teacher's monitor, not what the student sees.
 */

export const LEAK_FALLBACK_REPLY =
  "I can't give that one away, but I can help you get there. Which step are you on right now, and what does your work look like so far?";

export interface GuardedTutorInput extends TutorContext {
  /** Server-side only. Problem id → teacher's answer key. */
  answerKeys: Record<string, string | undefined>;
}

export interface GuardOutcome {
  /** True if any draft was caught leaking. */
  leakDetected: boolean;
  regenerated: boolean;
  fallback: boolean;
  leakedProblemIds: string[];
}

export interface GuardedTutorResult {
  reply: string;
  citations: string[];
  flags: MessageFlag[];
  guard: GuardOutcome;
  /** The first, unchecked draft. For evals and logs only; never show it to a student. */
  rawDraft: string;
}

export async function classifyMessage(input: ClassifyInput): Promise<MessageFlag[]> {
  // Obvious injection shapes are flagged even if the model call misses them or fails.
  const backstop: MessageFlag[] = looksLikeInjection(input.message) ? ["jailbreak"] : [];
  try {
    const result = await completeJson({
      purpose: "guard.classify",
      messages: classifyMessagePromptV1(input),
      schemaName: "message_classification",
      schema: MessageClassification,
      reasoningEffort: "minimal",
    });
    return [...new Set([...result.data.flags, ...backstop])];
  } catch (err) {
    console.error("[guard] classification failed; continuing with pattern flags only", err);
    return backstop;
  }
}

export async function checkLeak(
  problems: LeakCheckProblem[],
  studentMessage: string,
  reply: string,
  mode: "chat" | "feedback" = "chat",
): Promise<LeakVerdict> {
  if (problems.length === 0) return { leaks: false, problemIds: [], reason: "No assigned problems." };
  const result = await completeJson({
    purpose: "guard.leak_check",
    messages: leakCheckPromptV1({ problems, studentMessage, reply, mode }),
    schemaName: "leak_verdict",
    schema: LeakVerdict,
    // Measured with `bench:leak`: minimal caught every judge-labelled leak and
    // every hand-written subtle control, same as medium, about 3x faster.
    reasoningEffort: "minimal",
  });
  return result.data;
}

export async function guardedTutorReply(input: GuardedTutorInput): Promise<GuardedTutorResult> {
  const { answerKeys, ...ctx } = input;
  const problems: LeakCheckProblem[] = ctx.assignment.problems.map((p) => ({
    id: p.id,
    prompt: p.prompt,
    answerKey: answerKeys[p.id],
  }));
  const previousReply = [...ctx.history].reverse().find((t) => t.role === "assistant")?.content;

  const [flags, draft] = await Promise.all([
    classifyMessage({ assignment: ctx.assignment, message: ctx.message, previousReply }),
    tutorReply(ctx),
  ]);

  const guard: GuardOutcome = { leakDetected: false, regenerated: false, fallback: false, leakedProblemIds: [] };
  // Include a shared draft so "confirming" an answer written in it also counts as a leak.
  const asked = ctx.draft ? `${ctx.message}\n\n[The student also shared this draft]\n${ctx.draft}` : ctx.message;
  const first = await checkLeak(problems, asked, draft.reply);
  if (!first.leaks) return { ...draft, flags, guard, rawDraft: draft.reply };

  guard.leakDetected = true;
  guard.regenerated = true;
  guard.leakedProblemIds = first.problemIds;
  const redraft = await tutorReply({ ...ctx, strict: { leakedProblemIds: first.problemIds } });
  const second = await checkLeak(problems, asked, redraft.reply);
  if (!second.leaks) return { ...redraft, flags, guard, rawDraft: draft.reply };

  guard.fallback = true;
  guard.leakedProblemIds = [...new Set([...first.problemIds, ...second.problemIds])];
  return { reply: LEAK_FALLBACK_REPLY, citations: [], flags, guard, rawDraft: draft.reply };
}
