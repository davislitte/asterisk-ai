/**
 * Canned responses for the dev-only FAKE test stub, keyed by call `purpose`.
 * Purposes without an entry get a schema-shaped placeholder (structured calls)
 * or a labeled placeholder sentence (text calls). Strings are returned as-is;
 * objects are JSON-encoded. A function fixture receives the prompt messages.
 */
import type { ChatMessage } from "./client";

type Fixture = string | object | ((messages: ChatMessage[]) => string | object);

function text(m: ChatMessage | undefined): string {
  if (!m) return "";
  return typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
}

export const FAKE_FIXTURES: Record<string, Fixture> = {
  // Cites the first source label in the prompt so the citation UI can be exercised.
  "tutor.reply": (messages) => {
    const match = /\[(S\d+)\] .+? — (.+)/.exec(text(messages.find((m) => m.role === "instructions")));
    const label = match?.[1];
    return {
      reply: label
        ? `[FAKE MODEL] Good question! Reread the "${match[2]!.trim()}" section. What does it say to do first? Try that step and tell me what you get.`
        : "[FAKE MODEL] Your teacher hasn't added sources for this yet, so ask them about it.",
      citations: label ? [label] : [],
    };
  },
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
