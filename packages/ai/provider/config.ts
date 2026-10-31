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

/** Reasoning efforts from least to most. Each provider accepts a contiguous range of these. */
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** muse-spark-1.3 accepts all of them (it rejects "none", which the API schema also lists). */
const MUSE_SPARK_EFFORTS = REASONING_EFFORTS;
/**
 * Muse Spark Open accepts low to xhigh and defaults to xhigh, its slowest
 * (dev.meta.ai/docs/muse-spark-open/prompting), so an effort is always sent.
 */
const MUSE_SPARK_OPEN_EFFORTS = ["low", "medium", "high", "xhigh"] as const satisfies readonly ReasoningEffort[];

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
  /** The `reasoning_effort` values the model accepts; requests are clamped into this range. */
  reasoningEfforts: readonly ReasoningEffort[];
  /**
   * How structured output is requested. "json_schema" constrains decoding to the
   * schema. "json_object" only guarantees valid JSON; the schema goes into the
   * instructions. Either way the reply is validated with zod.
   */
  structuredOutput: "json_schema" | "json_object";
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
        reasoningEfforts: MUSE_SPARK_EFFORTS,
        structuredOutput: "json_schema",
      };
    case "BASETEN":
      return {
        provider,
        baseUrl: stripTrailingSlash(env.BASETEN_BASE_URL?.trim() || "https://inference.baseten.co/v1"),
        apiKey: required(env, "BASETEN_API_KEY"),
        model: env.BASETEN_MODEL?.trim() || "meta-models/muse-spark-open",
        instructionRole: "system",
        reasoningEfforts: MUSE_SPARK_OPEN_EFFORTS,
        // Schema-constrained decoding on Baseten sometimes loops on whitespace inside an
        // array until max tokens (2/24 leak checks, strict or not); json_object: 0/36.
        structuredOutput: "json_object",
      };
    case "MODAL":
      return {
        provider,
        baseUrl: stripTrailingSlash(required(env, "MODAL_BASE_URL")),
        apiKey: env.MODAL_API_KEY?.trim() || undefined,
        model: env.MODAL_MODEL?.trim() || "muse-spark-open",
        instructionRole: "system",
        reasoningEfforts: MUSE_SPARK_OPEN_EFFORTS,
        structuredOutput: "json_object",
      };
    case "FAKE":
      assertFakeAllowed(env);
      return {
        provider,
        baseUrl: "fake://local-test-stub",
        apiKey: undefined,
        model: FAKE_MODEL_ID,
        instructionRole: "developer",
        reasoningEfforts: MUSE_SPARK_EFFORTS,
        structuredOutput: "json_schema",
      };
  }
}

/**
 * The effort to send: the requested one if the model accepts it, otherwise the
 * nearest accepted one (Muse Spark Open turns "minimal" into "low", "max" into "xhigh").
 */
export function wireReasoningEffort(config: ProviderConfig, requested: ReasoningEffort | undefined): ReasoningEffort | undefined {
  if (!requested || config.reasoningEfforts.length === 0) return undefined;
  if (config.reasoningEfforts.includes(requested)) return requested;
  const rank = REASONING_EFFORTS.indexOf(requested);
  const ranks = config.reasoningEfforts.map((e) => REASONING_EFFORTS.indexOf(e));
  const nearest = rank < Math.min(...ranks) ? Math.min(...ranks) : Math.max(...ranks);
  return REASONING_EFFORTS[nearest];
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
