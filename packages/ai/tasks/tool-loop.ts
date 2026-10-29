import { z } from "zod";
import { type ChatMessage, type ReasoningEffort, type ToolCall, type ToolDefinition, complete } from "../provider/client";

/**
 * A bounded tool-calling loop (Chat Completions function tools,
 * https://dev.meta.ai/docs/tool-calling). The model calls tools until it stops
 * asking or the budget runs out. Arguments are validated with zod before any
 * tool runs, and tool errors go back to the model as results, not exceptions.
 */

export interface AgentTool<A = unknown> {
  name: string;
  description: string;
  args: z.ZodType<A>;
  run(args: A): Promise<unknown>;
}

/** Tools with different argument types, in one list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentTool = AgentTool<any>;

/** Type-checks a tool's `run` against its zod args. */
export function defineTool<A>(tool: AgentTool<A>): AgentTool<A> {
  return tool;
}

export interface AgentStep {
  tool: string;
  args: unknown;
  ok: boolean;
  /** Validation or runtime error sent back to the model. */
  error?: string;
  ms: number;
}

export interface ToolLoopInput {
  purpose: string;
  messages: ChatMessage[];
  tools: AnyAgentTool[];
  /** Model turns, each of which may ask for several tools at once. */
  maxRounds: number;
  /** Total tool calls across all rounds. Calls past this get an error result. */
  maxToolCalls: number;
  /** Tool results longer than this are cut, so one big result can't blow up every later turn. */
  maxResultChars?: number;
  reasoningEffort?: ReasoningEffort;
}

export interface ToolLoopResult {
  /** The full conversation, including tool calls and results, for a follow-up call. */
  messages: ChatMessage[];
  steps: AgentStep[];
  rounds: number;
  /** True when the model stopped on its own rather than hitting a budget. */
  finished: boolean;
  usage: { tokensIn: number; tokensOut: number };
}

const DEFAULT_MAX_RESULT_CHARS = 12_000;

export function toolDefinition(tool: AgentTool): ToolDefinition {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.args, { target: "draft-7" }) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, parameters };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[cut: result was ${text.length} characters]`;
}

async function runCall(call: ToolCall, tools: Map<string, AgentTool>, maxChars: number): Promise<{ content: string; step: AgentStep }> {
  const started = performance.now();
  const step = (ok: boolean, args: unknown, error?: string): AgentStep => ({
    tool: call.name,
    args,
    ok,
    ...(error ? { error } : {}),
    ms: Math.round(performance.now() - started),
  });

  const tool = tools.get(call.name);
  if (!tool) {
    const error = `Unknown tool "${call.name}".`;
    return { content: JSON.stringify({ error }), step: step(false, call.arguments, error) };
  }
  let raw: unknown;
  try {
    raw = call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    const error = "Arguments were not valid JSON.";
    return { content: JSON.stringify({ error }), step: step(false, call.arguments, error) };
  }
  const parsed = tool.args.safeParse(raw);
  if (!parsed.success) {
    const error = `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ")}`;
    return { content: JSON.stringify({ error }), step: step(false, raw, error) };
  }
  try {
    const result = await tool.run(parsed.data);
    return { content: clip(JSON.stringify(result), maxChars), step: step(true, parsed.data) };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Tool failed.";
    return { content: JSON.stringify({ error }), step: step(false, parsed.data, error) };
  }
}

export async function runToolLoop(input: ToolLoopInput): Promise<ToolLoopResult> {
  const tools = new Map<string, AgentTool>(input.tools.map((t) => [t.name, t]));
  const definitions = input.tools.map((t) => toolDefinition(t));
  const maxChars = input.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
  const messages = [...input.messages];
  const steps: AgentStep[] = [];
  const usage = { tokensIn: 0, tokensOut: 0 };
  let rounds = 0;

  while (rounds < input.maxRounds) {
    rounds++;
    const result = await complete({
      purpose: input.purpose,
      messages,
      tools: definitions,
      reasoningEffort: input.reasoningEffort,
    });
    usage.tokensIn += result.usage.tokensIn ?? 0;
    usage.tokensOut += result.usage.tokensOut ?? 0;

    if (result.toolCalls.length === 0) {
      if (result.text.trim()) messages.push({ role: "assistant", content: result.text });
      return { messages, steps, rounds, finished: true, usage };
    }

    // Every call in this turn needs a result, even the ones over budget.
    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
    for (const call of result.toolCalls) {
      if (steps.length >= input.maxToolCalls) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ error: "Tool budget used up. Work with what you have." }),
        });
        continue;
      }
      const { content, step } = await runCall(call, tools, maxChars);
      steps.push(step);
      messages.push({ role: "tool", toolCallId: call.id, content });
    }
    if (steps.length >= input.maxToolCalls) break;
  }

  return { messages, steps, rounds, finished: false, usage };
}
