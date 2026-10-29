import { z } from "zod";
import { type AiProvider, type ProviderConfig, resolveProviderConfig } from "./config";
import { ModelCallError, isRetryableStatus } from "./errors";
import { fakeChatCompletion } from "./fake";
import { checkSpend } from "./spend-guard";
import { logModelCall } from "./logging";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** A function call the model asked for. `arguments` is the raw JSON string from the API. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** A function the model may call (Chat Completions `tools`, https://dev.meta.ai/docs/tool-calling). */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

/**
 * Provider-neutral message. `instructions` becomes `developer` on the Meta Model
 * API and `system` on self-hosted open-weight servers.
 */
export type ChatMessage =
  | { role: "instructions" | "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | ContentPart[]; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/** Values muse-spark-1.3 accepts (the API schema also lists "none", which this model rejects). */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface CompletionRequest {
  /** What this call is for, e.g. "tutor", "leak_check". Logged with every call. */
  purpose: string;
  messages: ChatMessage[];
  reasoningEffort?: ReasoningEffort;
  maxCompletionTokens?: number;
  /** Per-attempt timeout. Muse Spark reasons before answering, so allow headroom. */
  timeoutMs?: number;
  maxAttempts?: number;
  /** Force a provider for this call instead of AI_PROVIDER. */
  provider?: AiProvider;
  /** Functions the model may call. The API only supports tool_choice "auto". */
  tools?: ToolDefinition[];
}

export interface CompletionResult {
  text: string;
  /** Empty unless the request had `tools` and the model chose to call some. */
  toolCalls: ToolCall[];
  finishReason: string | null;
  provider: AiProvider;
  model: string;
  latencyMs: number;
  usage: { tokensIn: number | null; tokensOut: number | null; reasoningTokens: number | null };
}

interface JsonResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

const ChatCompletionResponse = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      completion_tokens_details: z
        .object({ reasoning_tokens: z.number().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

const ErrorEnvelope = z.object({ error: z.object({ message: z.string() }) });

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 500;
}

function toWireMessages(messages: ChatMessage[], config: ProviderConfig) {
  return messages.map((m) => {
    switch (m.role) {
      case "instructions":
        return { role: config.instructionRole, content: m.content };
      case "tool":
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      case "assistant":
        // The assistant turn that asked for tools must be sent back with its tool_calls.
        return m.toolCalls?.length
          ? {
              role: "assistant",
              content: m.content || null,
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: c.arguments },
              })),
            }
          : { role: "assistant", content: m.content };
      default:
        return { role: m.role, content: m.content };
    }
  });
}

async function readErrorMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = ErrorEnvelope.safeParse(JSON.parse(body));
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // not JSON
  }
  return body.slice(0, 300) || res.statusText;
}

async function chatCompletion(
  req: CompletionRequest,
  responseFormat?: JsonResponseFormat,
): Promise<CompletionResult> {
  const config = resolveProviderConfig(process.env, req.provider);
  const maxAttempts = req.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const started = performance.now();

  const body: Record<string, unknown> = {
    model: config.model,
    messages: toWireMessages(req.messages, config),
  };
  if (req.reasoningEffort && config.supportsReasoningEffort) {
    body.reasoning_effort = req.reasoningEffort;
  }
  if (req.maxCompletionTokens) body.max_completion_tokens = req.maxCompletionTokens;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (responseFormat) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: responseFormat.name, schema: responseFormat.schema },
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let attempts = 0;
  let lastError: ModelCallError | undefined;

  const fail = async (error: ModelCallError): Promise<never> => {
    await logModelCall({
      provider: config.provider,
      model: config.model,
      purpose: req.purpose,
      latencyMs: Math.round(performance.now() - started),
      tokensIn: null,
      tokensOut: null,
      attempts,
      ok: false,
      error: error.message,
      createdAt: new Date(),
    });
    throw error;
  };

  // Hard spending stop before any real (paid) call. FAKE costs nothing.
  if (config.provider !== "FAKE") {
    try {
      await checkSpend(req.purpose);
    } catch (cause) {
      return fail(
        new ModelCallError({
          message: cause instanceof Error ? cause.message : "Spending cap reached",
          provider: config.provider,
          purpose: req.purpose,
          retryable: false,
          spendCapReached: true,
          cause,
        }),
      );
    }
  }

  while (attempts < maxAttempts) {
    if (attempts > 0) await sleep(backoffMs(attempts - 1));
    attempts++;

    let payload: unknown;
    if (config.provider === "FAKE") {
      // Dev-only test stub: canned response built locally, no network, no model.
      payload = fakeChatCompletion({
        purpose: req.purpose,
        messages: req.messages,
        schema: responseFormat?.schema,
        hasTools: Boolean(req.tools?.length),
      });
    } else {
      let res: Response;
      try {
        res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (cause) {
        const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
        lastError = new ModelCallError({
          message: timedOut ? "Request timed out" : `Network error: ${String(cause)}`,
          provider: config.provider,
          purpose: req.purpose,
          retryable: true,
          cause,
        });
        continue;
      }

      if (!res.ok) {
        const error = new ModelCallError({
          message: `HTTP ${res.status}: ${await readErrorMessage(res)}`,
          provider: config.provider,
          purpose: req.purpose,
          status: res.status,
          retryable: isRetryableStatus(res.status),
        });
        if (!error.retryable) return fail(error);
        lastError = error;
        continue;
      }
      payload = await res.json().catch(() => null);
    }

    const parsed = ChatCompletionResponse.safeParse(payload);
    if (!parsed.success) {
      return fail(
        new ModelCallError({
          message: `Unexpected response shape: ${parsed.error.message}`,
          provider: config.provider,
          purpose: req.purpose,
          retryable: false,
        }),
      );
    }

    const data = parsed.data;
    const choice = data.choices[0]!;
    const result: CompletionResult = {
      text: choice.message.content ?? "",
      toolCalls: (choice.message.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: c.function.arguments,
      })),
      finishReason: choice.finish_reason ?? null,
      provider: config.provider,
      model: data.model ?? config.model,
      latencyMs: Math.round(performance.now() - started),
      usage: {
        tokensIn: data.usage?.prompt_tokens ?? null,
        tokensOut: data.usage?.completion_tokens ?? null,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      },
    };

    await logModelCall({
      provider: result.provider,
      model: result.model,
      purpose: req.purpose,
      latencyMs: result.latencyMs,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      attempts,
      ok: true,
      error: null,
      createdAt: new Date(),
    });
    return result;
  }

  return fail(
    lastError ??
      new ModelCallError({
        message: "No attempts made",
        provider: config.provider,
        purpose: req.purpose,
        retryable: false,
      }),
  );
}

/** Plain-text completion. */
export function complete(req: CompletionRequest): Promise<CompletionResult> {
  return chatCompletion(req);
}

/**
 * Schema-constrained completion. The JSON schema is derived from the zod schema
 * and the result is validated again on our side before it's returned.
 */
export async function completeJson<T>(
  req: CompletionRequest & { schemaName: string; schema: z.ZodType<T> },
): Promise<CompletionResult & { data: T }> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(req.schema, {
    target: "draft-7",
  }) as Record<string, unknown>;
  const result = await chatCompletion(req, { name: req.schemaName, schema: jsonSchema });

  let raw: unknown;
  try {
    raw = JSON.parse(result.text);
  } catch (cause) {
    throw new ModelCallError({
      message: "Structured output was not valid JSON",
      provider: result.provider,
      purpose: req.purpose,
      retryable: false,
      cause,
    });
  }
  const parsed = req.schema.safeParse(raw);
  if (!parsed.success) {
    throw new ModelCallError({
      message: `Structured output failed validation: ${parsed.error.message}`,
      provider: result.provider,
      purpose: req.purpose,
      retryable: false,
    });
  }
  return { ...result, data: parsed.data };
}
