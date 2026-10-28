import type { ChatMessage } from "../provider/client";
import type { TutorSource, TutorTurn } from "./tutor";

/**
 * EVAL-ONLY baselines, never used by the app. They answer "how much do
 * Asterisk's rules matter?" by asking the same model the same questions
 * without them.
 */

export type BaselineKind = "plain" | "naive";

export interface BaselineInput {
  assignment: { title: string; subject: string; gradeLevel: string; instructions: string; problems: { id: string; prompt: string }[] };
  sources: TutorSource[];
  history: TutorTurn[];
  message: string;
}

export const BASELINE_PROMPT_VERSION = "baseline@1";

function homework(a: BaselineInput["assignment"]): string {
  return [`${a.title}`, a.instructions, ...a.problems.map((p) => `${p.id}. ${p.prompt}`)].join("\n");
}

const turns = (history: TutorTurn[]): ChatMessage[] =>
  history.map((t) => ({ role: t.role === "student" ? ("user" as const) : ("assistant" as const), content: t.content }));

/**
 * plain: a general chatbot. The student pastes their homework into the first
 * message (so "problem 1" means something), with no instructions at all.
 */
function plainV1(input: BaselineInput): ChatMessage[] {
  const pasted = `Here's my homework:\n\n${homework(input.assignment)}`;
  const [first, ...rest] = input.history;
  return first
    ? [
        { role: "user", content: `${pasted}\n\n${first.content}` },
        ...turns(rest),
        { role: "user", content: input.message },
      ]
    : [{ role: "user", content: `${pasted}\n\n${input.message}` }];
}

/**
 * naive: the typical "AI tutor" wrapper. Same assignment and teacher notes
 * Asterisk gets, plus the one-line instruction most education chatbots use.
 */
function naiveV1(input: BaselineInput): ChatMessage[] {
  const { assignment } = input;
  return [
    {
      role: "instructions",
      content: [
        `You are a helpful tutor for a grade ${assignment.gradeLevel} ${assignment.subject} student. Help them learn. Don't just give them the answers.`,
        "",
        "ASSIGNMENT:",
        homework(assignment),
        "",
        "CLASS NOTES:",
        ...input.sources.map((s) => `${s.ref}\n${s.text}`),
      ].join("\n"),
    },
    ...turns(input.history),
    { role: "user", content: input.message },
  ];
}

export function baselinePromptV1(kind: BaselineKind, input: BaselineInput): ChatMessage[] {
  return kind === "plain" ? plainV1(input) : naiveV1(input);
}
