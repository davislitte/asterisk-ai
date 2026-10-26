/**
 * ⚠️ DEV-ONLY TEST STUB — NOT A MODEL.
 *
 * Builds a canned Chat Completions response locally so the dashboard and
 * extension can be built and tested before Meta API credits are available.
 * It never makes a network request, never calls any model, logs a warning on
 * every call, and throws if NODE_ENV is "production".
 *
 * The response has the exact wire shape the real providers return, so it flows
 * through the same parsing, validation and logging code in ./client.ts.
 */
import type { ChatMessage } from "./client";
import { FAKE_MODEL_ID, assertFakeAllowed } from "./config";
import { FAKE_FIXTURES } from "./fake-fixtures";

type JsonSchema = Record<string, unknown>;

export interface FakeRequest {
  purpose: string;
  messages?: ChatMessage[];
  /** Present when the caller asked for structured output. */
  schema?: JsonSchema;
}

let counter = 0;

export function fakeChatCompletion(req: FakeRequest): unknown {
  assertFakeAllowed();
  console.warn(
    `[FAKE MODEL] "${req.purpose}": returning a canned response from the dev-only test stub. ` +
      "No model was called. Set AI_PROVIDER=META_API to use Muse Spark.",
  );

  const entry = FAKE_FIXTURES[req.purpose];
  const fixture = typeof entry === "function" ? entry(req.messages ?? []) : entry;
  const content = fixture
    ? typeof fixture === "string"
      ? fixture
      : JSON.stringify(fixture)
    : req.schema
      ? JSON.stringify(sampleFromSchema(req.schema, req.purpose))
      : `[FAKE MODEL] Canned response for "${req.purpose}". This text did not come from a model.`;

  counter += 1;
  return {
    id: `fake-${counter}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: FAKE_MODEL_ID,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content },
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

/** Produces the smallest value that satisfies a JSON schema (as emitted by z.toJSONSchema). */
export function sampleFromSchema(schema: JsonSchema, label = "value"): unknown {
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (Array.isArray(variants) && variants.length > 0) return sampleFromSchema(variants[0]!, label);

  const type = Array.isArray(schema.type)
    ? (schema.type as string[]).find((t) => t !== "null")
    : (schema.type as string | undefined);

  switch (type) {
    case "object": {
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      return Object.fromEntries(
        Object.entries(properties).map(([key, sub]) => [key, sampleFromSchema(sub, key)]),
      );
    }
    case "array": {
      const items = (schema.items ?? {}) as JsonSchema;
      const count = Math.max(1, Number(schema.minItems ?? 1));
      return Array.from({ length: count }, () => sampleFromSchema(items, label));
    }
    case "integer":
    case "number": {
      const min = schema.minimum ?? schema.exclusiveMinimum;
      return typeof min === "number" ? (type === "integer" ? Math.ceil(min) : min) : 0;
    }
    case "boolean":
      return false;
    case "null":
      return null;
    case "string":
    default:
      return `[FAKE] ${label}`;
  }
}
