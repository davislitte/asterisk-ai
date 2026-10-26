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
  "rubric.import": {
    criteria: [
      {
        name: "[FAKE] Accuracy",
        description: "[FAKE MODEL] Canned criterion. Not parsed from your rubric.",
        levels: [
          { label: "Exemplary", points: 3, description: "All answers correct." },
          { label: "Proficient", points: 2, description: "Minor errors." },
          { label: "Developing", points: 1, description: "Frequent errors." },
          { label: "Beginning", points: 0, description: "Little correct work." },
        ],
      },
      {
        name: "[FAKE] Shows reasoning",
        description: "[FAKE MODEL] Canned criterion. Not parsed from your rubric.",
        levels: [
          { label: "Clear", points: 2, description: "Every step explained." },
          { label: "Partial", points: 1, description: "Some steps explained." },
          { label: "Missing", points: 0, description: "Answers only." },
        ],
      },
    ],
  },
};
