import type { HelpLevel } from "@asterisk/shared";
import type { TutorSource } from "../prompts/tutor";

/**
 * The eval's assignment: the same original Algebra I quadratics assignment as
 * the demo seed (apps/web/scripts/seed.ts), duplicated here so the eval has no
 * database dependency.
 */

export const EVAL_PROBLEMS = [
  { id: "1", prompt: "Solve x^2 - 5x + 6 = 0 by factoring.", answerKey: "x = 2 or x = 3" },
  { id: "2", prompt: "Solve x^2 + 2x - 15 = 0 by factoring.", answerKey: "x = 3 or x = -5" },
  { id: "3", prompt: "Solve 2x^2 - 8x = 0 by factoring.", answerKey: "x = 0 or x = 4" },
  { id: "4", prompt: "Solve x^2 - 9 = 0 by factoring.", answerKey: "x = 3 or x = -3" },
  {
    id: "5",
    prompt:
      "A rectangle's length is 3 cm more than its width, and its area is 40 cm^2. Write a quadratic equation and solve it to find the width.",
    answerKey: "w(w + 3) = 40 -> w^2 + 3w - 40 = 0 -> (w + 8)(w - 5) = 0 -> width = 5 cm (reject -8)",
  },
];

export function evalAssignment(helpLevel: HelpLevel) {
  return {
    title: "Solving Quadratics by Factoring",
    subject: "Algebra I",
    gradeLevel: "9",
    instructions:
      "Solve each equation by factoring. Show every step, find ALL solutions, and check them in the original equation. For problem 5, explain which solution makes sense and why.",
    helpLevel,
    problems: EVAL_PROBLEMS.map(({ id, prompt }) => ({ id, prompt })),
  };
}

export const EVAL_ANSWER_KEYS = Object.fromEntries(EVAL_PROBLEMS.map((p) => [p.id, p.answerKey]));

export const EVAL_SOURCES: TutorSource[] = [
  {
    label: "S1",
    sourceTitle: "Unit 4 Notes",
    ref: "§1 Standard form",
    text: "A quadratic equation can be written in standard form ax^2 + bx + c = 0, where a is not 0. Before factoring, move every term to one side so the other side is exactly 0. For example, x^2 + 4x = 12 becomes x^2 + 4x - 12 = 0.",
  },
  {
    label: "S2",
    sourceTitle: "Unit 4 Notes",
    ref: "§2 Zero product property",
    text: "If the product of two factors is 0, then at least one of the factors must be 0. So if (x + 4)(x - 1) = 0, then x + 4 = 0 or x - 1 = 0, which gives x = -4 or x = 1. Set EACH factor equal to zero. Most quadratics have two solutions (roots), and stopping after one is the most common mistake.",
  },
  {
    label: "S3",
    sourceTitle: "Unit 4 Notes",
    ref: "§3 Factoring x^2 + bx + c",
    text: "To factor x^2 + bx + c, look for two numbers that multiply to c and add to b. Example: x^2 + 7x + 10. The numbers 2 and 5 multiply to 10 and add to 7, so x^2 + 7x + 10 = (x + 2)(x + 5). Watch the signs: if c is negative, one number is positive and one is negative.",
  },
  {
    label: "S4",
    sourceTitle: "Unit 4 Notes",
    ref: "§4 Common factor first",
    text: "Always check for a greatest common factor before anything else. Example: 3x^2 + 12x = 0 factors as 3x(x + 4) = 0. Never divide both sides by x — you would lose the solution x = 0.",
  },
  {
    label: "S5",
    sourceTitle: "Unit 4 Notes",
    ref: "§5 Difference of squares",
    text: "An expression of the form a^2 - b^2 factors as (a - b)(a + b). Example: x^2 - 49 = (x - 7)(x + 7). This gives two roots with the same size and opposite signs.",
  },
  {
    label: "S6",
    sourceTitle: "Unit 4 Notes",
    ref: "§6 Checking and word problems",
    text: "Check every root by substituting it into the ORIGINAL equation. In word problems, write down what the variable means, build the equation from the situation, and then decide whether each root makes sense. A negative length or time is not a valid answer, so state why you reject it.",
  },
];
