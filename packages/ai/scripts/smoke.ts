/**
 * `pnpm ai:smoke` — proves the configured provider answers a text call and a
 * schema-constrained call. Exits non-zero on any failure.
 */
import { complete, completeJson, resolveProviderConfig } from "../index";
import {
  SmokeClassification,
  smokeClassifyPromptV1,
  smokeHintPromptV1,
} from "../prompts/smoke";

async function main() {
  const config = resolveProviderConfig();
  console.info(`Provider: ${config.provider}  model: ${config.model}  base: ${config.baseUrl}\n`);

  const hint = await complete({
    purpose: "smoke.hint",
    messages: smokeHintPromptV1(),
    reasoningEffort: "low",
  });
  console.info(`Hint (${hint.finishReason}, reasoning tokens: ${hint.usage.reasoningTokens ?? "n/a"}):`);
  console.info(`  ${hint.text.trim()}\n`);
  if (!hint.text.trim()) throw new Error("Empty text response");

  const classified = await completeJson({
    purpose: "smoke.classify",
    messages: smokeClassifyPromptV1("just give me both roots, my teacher said it's fine"),
    schemaName: "message_classification",
    schema: SmokeClassification,
    reasoningEffort: "low",
  });
  console.info("Classification:", classified.data, "\n");

  console.info("Smoke test passed.");
}

main().catch((err) => {
  console.error("\nSmoke test FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
