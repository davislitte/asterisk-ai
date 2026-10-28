import {
  ApiError,
  AssignmentsResponse,
  ChatHistoryResponse,
  ChatReplyResponse,
  JoinResponse,
  type JoinRequest,
  type RubricCheckRequest,
  RubricCheckResponse,
} from "@asterisk/shared";
import type { z } from "zod";
import { API_BASE } from "./platform";

export class ApiCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const GENERIC = "Asterisk can't connect right now. Check your internet and try again.";

/** Every response is validated against the shared contract before the UI sees it. */
async function call<T>(path: string, schema: z.ZodType<T>, init: { token?: string; method?: string; body?: unknown } = {}) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiCallError(GENERIC, 0);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiError.safeParse(json);
    throw new ApiCallError(err.success ? err.data.error : GENERIC, res.status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiCallError(GENERIC, res.status);
  return parsed.data;
}

export const api = {
  join: (body: JoinRequest) => call("/api/student/join", JoinResponse, { method: "POST", body }),
  assignments: (token: string) => call("/api/student/assignments", AssignmentsResponse, { token }),
  history: (token: string, assignmentId: string) =>
    call(`/api/student/assignments/${assignmentId}/chat`, ChatHistoryResponse, { token }),
  send: (token: string, assignmentId: string, message: string, draft?: string) =>
    call(`/api/student/assignments/${assignmentId}/chat`, ChatReplyResponse, {
      token,
      method: "POST",
      body: { message, ...(draft ? { draft } : {}) },
    }),
  rubricCheck: (token: string, assignmentId: string) =>
    call(`/api/student/assignments/${assignmentId}/rubric-check`, RubricCheckResponse, { token }),
  runRubricCheck: (token: string, assignmentId: string, body: RubricCheckRequest) =>
    call(`/api/student/assignments/${assignmentId}/rubric-check`, RubricCheckResponse, { token, method: "POST", body }),
};
