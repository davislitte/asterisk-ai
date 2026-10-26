import { z } from "zod";

/**
 * Every runtime model call goes to a Meta model. The provider only decides
 * *where* that model is served:
 * - META_API: Muse Spark on the Meta Model API (https://dev.meta.ai/docs/quickstart)
 * - BASETEN:  Muse Spark Open on Baseten Model APIs ("district-hosted mode")
 * - MODAL:    Muse Spark Open on our own Modal deployment ("district-hosted mode")
 * All three speak the OpenAI-compatible Chat Completions protocol.
 *
 * - FAKE: ⚠️ DEV-ONLY TEST STUB, not a model. Returns canned responses locally
 *   so the UI can be built without an API key. Never calls any external
 *   service and refuses to run when NODE_ENV is "production". See ./fake.ts.
 */
export const AiProvider = z.enum(["META_API", "BASETEN", "MODAL", "FAKE"]);
export type AiProvider = z.infer<typeof AiProvider>;

export interface ProviderConfig {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  /**
   * Meta Model API recommends the `developer` role for instructions (`system` is
   * remapped to developer level). Self-hosted open-weight servers expect `system`.
   */
  instructionRole: "developer" | "system";
  /** Whether the server accepts `reasoning_effort`. */
  supportsReasoningEffort: boolean;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local (see .env.example).`);
  }
  return value;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveProviderConfig(
  env: Env = process.env,
  override?: AiProvider,
): ProviderConfig {
  const provider = override ?? AiProvider.parse(env.AI_PROVIDER?.trim() || "META_API");

  switch (provider) {
    case "META_API":
      return {
        provider,
        baseUrl: stripTrailingSlash(env.META_API_BASE_URL?.trim() || "https://api.meta.ai/v1"),
        apiKey: required(env, "MODEL_API_KEY"),
        // Not the `-contributor` variant: that one trains on request data, and our users are minors.
        model: env.META_MODEL?.trim() || "muse-spark-1.3",
        instructionRole: "developer",
        supportsReasoningEffort: true,
      };
    case "BASETEN":
      return {
        provider,
        baseUrl: stripTrailingSlash(env.BASETEN_BASE_URL?.trim() || "https://inference.baseten.co/v1"),
        apiKey: required(env, "BASETEN_API_KEY"),
        model: env.BASETEN_MODEL?.trim() || "meta-models/muse-spark-open-1026",
        instructionRole: "system",
        supportsReasoningEffort: false,
      };
    case "MODAL":
      return {
        provider,
        baseUrl: stripTrailingSlash(required(env, "MODAL_BASE_URL")),
        apiKey: env.MODAL_API_KEY?.trim() || undefined,
        model: env.MODAL_MODEL?.trim() || "muse-spark-open",
        instructionRole: "system",
        supportsReasoningEffort: false,
      };
    case "FAKE":
      assertFakeAllowed(env);
      return {
        provider,
        baseUrl: "fake://local-test-stub",
        apiKey: undefined,
        model: FAKE_MODEL_ID,
        instructionRole: "developer",
        supportsReasoningEffort: true,
      };
  }
}

export const FAKE_MODEL_ID = "fake-test-stub";

/** The FAKE test stub must never be reachable in a production build. */
export function assertFakeAllowed(env: Env = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "AI_PROVIDER=FAKE is a dev-only test stub and is disabled when NODE_ENV=production.",
    );
  }
}
