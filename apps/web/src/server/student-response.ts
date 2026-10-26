/**
 * The student-facing API boundary.
 *
 * Every route under `src/app/api/student/` must respond through `studentJson()`
 * and build assignment payloads with `toStudentAssignment()` from
 * @asterisk/shared. `student-boundary.test.ts` enforces both, so answer keys
 * (`problems[].answerKey`) can never reach the extension.
 */

const FORBIDDEN_KEYS = new Set(["answerkey", "answer_key"]);

export class StudentPayloadLeakError extends Error {
  constructor(path: string) {
    super(`Refusing to send teacher-only field "${path}" to a student route.`);
    this.name = "StudentPayloadLeakError";
  }
}

/** Throws if any nested object key looks like a teacher-only answer field. */
export function assertNoAnswerKeys(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoAnswerKeys(item, `${path}[${i}]`));
  } else if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) throw new StudentPayloadLeakError(`${path}.${key}`);
      assertNoAnswerKeys(child, `${path}.${key}`);
    }
  }
}

/** `Response.json` for student routes, with a last-line check for answer keys. */
export function studentJson(data: unknown, init?: ResponseInit): Response {
  try {
    assertNoAnswerKeys(data);
  } catch (err) {
    console.error("[student-boundary]", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  return Response.json(data, init);
}
