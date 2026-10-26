import type { AiProvider } from "./config";

/** The only error text a student ever sees. Raw provider errors stay server-side. */
export const STUDENT_SAFE_ERROR_MESSAGE =
  "Asterisk is having trouble thinking right now. Please try again in a moment.";

export class ModelCallError extends Error {
  readonly provider: AiProvider;
  readonly purpose: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(opts: {
    message: string;
    provider: AiProvider;
    purpose: string;
    status?: number;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "ModelCallError";
    this.provider = opts.provider;
    this.purpose = opts.purpose;
    this.status = opts.status;
    this.retryable = opts.retryable;
  }

  get userMessage(): string {
    return STUDENT_SAFE_ERROR_MESSAGE;
  }
}

/** Per the Meta cookbook: retry 429, 5xx and network/timeouts; never retry other 4xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
