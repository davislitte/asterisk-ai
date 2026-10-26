/**
 * Canned responses for the dev-only FAKE test stub, keyed by call `purpose`.
 * Purposes without an entry get a schema-shaped placeholder (structured calls)
 * or a labeled placeholder sentence (text calls). Strings are returned as-is;
 * objects are JSON-encoded.
 */
export const FAKE_FIXTURES: Record<string, string | object> = {
  "smoke.hint": "[FAKE MODEL] What two numbers multiply to 6 and add to -5?",
  "smoke.classify": {
    flag: "answer_seeking",
    reason: "[FAKE MODEL] The student asked for the roots directly.",
  },
};
