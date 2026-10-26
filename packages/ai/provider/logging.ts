import type { AiProvider } from "./config";

/** Mirrors the ModelCallLog table. One entry per model call, success or failure. */
export interface ModelCallLogEntry {
  provider: AiProvider;
  model: string;
  purpose: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  attempts: number;
  ok: boolean;
  error: string | null;
  createdAt: Date;
}

export type ModelCallLogger = (entry: ModelCallLogEntry) => void | Promise<void>;

/**
 * Default sink for scripts. The web app swaps in a database-backed logger so
 * `packages/ai` doesn't depend on the database.
 */
export const consoleModelCallLogger: ModelCallLogger = (entry) => {
  const tokens = entry.ok ? ` in=${entry.tokensIn ?? "?"} out=${entry.tokensOut ?? "?"}` : "";
  const status = entry.ok ? "ok" : `FAILED (${entry.error})`;
  console.info(
    `[model-call] ${entry.purpose} ${entry.provider}/${entry.model} ${entry.latencyMs}ms${tokens} attempts=${entry.attempts} ${status}`,
  );
};

let activeLogger: ModelCallLogger = consoleModelCallLogger;

export function setModelCallLogger(logger: ModelCallLogger): void {
  activeLogger = logger;
}

export async function logModelCall(entry: ModelCallLogEntry): Promise<void> {
  try {
    await activeLogger(entry);
  } catch (err) {
    // Logging must never break a student's request.
    console.error("[model-call] logger failed", err);
  }
}
