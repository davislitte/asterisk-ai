import { type TutorContext, TutorReply, tutorPromptV1 } from "../prompts/tutor";
import { completeJson } from "../provider/client";

/** One guided-tutor turn. Citations are filtered to labels that exist in the context. */
export async function tutorReply(ctx: TutorContext): Promise<TutorReply> {
  const result = await completeJson({
    purpose: "tutor.reply",
    messages: tutorPromptV1(ctx),
    schemaName: "tutor_reply",
    schema: TutorReply,
    reasoningEffort: "minimal",
  });
  const known = new Set(ctx.sources.map((s) => s.label));
  return {
    reply: result.data.reply.trim(),
    citations: [...new Set(result.data.citations.map((c) => c.trim().replace(/^\[|\]$/g, "")))].filter((c) =>
      known.has(c),
    ),
  };
}
