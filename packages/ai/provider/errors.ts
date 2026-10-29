import type { AiProvider } from "./config";

/** The only error text a student ever sees. Raw provider errors stay server-side. */
export const STUDENT_SAFE_ERROR_MESSAGE =
  "Asterisk is having trouble thinking right now. Please try again in a moment.";

export class ModelCallError extends Error {
  readonly provider: AiProvider;
  readonly purpose: string;
  readonly status: number | undefined;
  readonly retryable: boolean;
  /** True when the call was blocked by the daily spending cap, not by the model. */
  readonly spendCapReached: boolean;

  constructor(opts: {
    message: string;
    provider: AiProvider;
    purpose: string;
    status?: number;
    retryable: boolean;
    spendCapReached?: boolean;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "ModelCallError";
    this.provider = opts.provider;
    this.purpose = opts.purpose;
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.spendCapReached = opts.spendCapReached ?? false;
  }

  get userMessage(): string {
    return this.spendCapReached ? SPEND_CAP_MESSAGE : STUDENT_SAFE_ERROR_MESSAGE;
  }
}

export const SPEND_CAP_MESSAGE =
  "Asterisk has reached today's usage limit for your school. Ask your teacher, or try again tomorrow.";

/** Per the Meta cookbook: retry 429, 5xx and network/timeouts; never retry other 4xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
