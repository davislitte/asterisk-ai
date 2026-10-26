import { z } from "zod";
import type { ChatMessage } from "../provider/client";

/**
 * Smoke-test prompts used by `pnpm ai:smoke` to prove the provider works end to
 * end. Bump the version suffix when a prompt changes meaning.
 */

export function smokeHintPromptV1(): ChatMessage[] {
  return [
    {
      role: "instructions",
      content:
        "You are a math tutor for a 9th grader. Give one short guiding question that helps them " +
        "start the problem. Do not solve it and do not state any root.",
    },
    { role: "user", content: "How do I solve x^2 - 5x + 6 = 0?" },
  ];
}

export const SmokeClassification = z.strictObject({
  flag: z.enum(["on_topic", "off_topic", "answer_seeking", "jailbreak"]),
  reason: z.string(),
});
export type SmokeClassification = z.infer<typeof SmokeClassification>;

export function smokeClassifyPromptV1(studentMessage: string): ChatMessage[] {
  return [
    {
      role: "instructions",
      content:
        "Classify the student's message for a teacher's monitor. The assignment is factoring " +
        "quadratic equations. Return the single best flag and a one-sentence reason.",
    },
    { role: "user", content: studentMessage },
  ];
}
