/**
 * `pnpm db:seed` — creates (or recreates) the demo teacher, class and a
 * quadratics assignment with sources, rubric and comprehension questions.
 * All content is original. Safe to re-run: it replaces the previous demo data.
 */
import type { AssignedProblem, RubricLevel } from "@asterisk/shared";
import { eq } from "drizzle-orm";
import { db, sqlClient } from "../src/db/client";
import {
  assignments,
  checkQuestions,
  classes,
  rubricCriteria,
  rubrics,
  sourceChunks,
  sources,
  students,
  teachers,
} from "../src/db/schema";

export const DEMO_JOIN_CODE = "QUAD24";

const problems: AssignedProblem[] = [
  { id: "1", prompt: "Solve x^2 - 5x + 6 = 0 by factoring.", answerKey: "x = 2 or x = 3" },
  { id: "2", prompt: "Solve x^2 + 2x - 15 = 0 by factoring.", answerKey: "x = 3 or x = -5" },
  { id: "3", prompt: "Solve 2x^2 - 8x = 0 by factoring.", answerKey: "x = 0 or x = 4" },
  { id: "4", prompt: "Solve x^2 - 9 = 0 by factoring.", answerKey: "x = 3 or x = -3" },
  {
    id: "5",
    prompt:
      "A rectangle's length is 3 cm more than its width, and its area is 40 cm^2. " +
      "Write a quadratic equation and solve it to find the width.",
    answerKey: "w(w + 3) = 40 → w^2 + 3w - 40 = 0 → (w + 8)(w - 5) = 0 → width = 5 cm (reject -8)",
  },
];

// Worked examples here deliberately differ from the assigned problems above.
const notesSections = [
  {
    ref: "§1 Standard form",
    text:
      "A quadratic equation can be written in standard form ax^2 + bx + c = 0, where a is not 0. " +
      "Before factoring, move every term to one side so the other side is exactly 0. For example, " +
      "x^2 + 4x = 12 becomes x^2 + 4x - 12 = 0.",
  },
  {
    ref: "§2 Zero product property",
    text:
      "If the product of two factors is 0, then at least one of the factors must be 0. So if " +
      "(x + 4)(x - 1) = 0, then x + 4 = 0 or x - 1 = 0, which gives x = -4 or x = 1. Set EACH " +
      "factor equal to zero. Most quadratics have two solutions (roots), and stopping after one " +
      "is the most common mistake.",
  },
  {
    ref: "§3 Factoring x^2 + bx + c",
    text:
      "To factor x^2 + bx + c, look for two numbers that multiply to c and add to b. Example: " +
      "x^2 + 7x + 10. The numbers 2 and 5 multiply to 10 and add to 7, so x^2 + 7x + 10 = " +
      "(x + 2)(x + 5). Watch the signs: if c is negative, one number is positive and one is negative.",
  },
  {
    ref: "§4 Common factor first",
    text:
      "Always check for a greatest common factor before anything else. Example: 3x^2 + 12x = 0 " +
      "factors as 3x(x + 4) = 0. Never divide both sides by x — you would lose the solution x = 0.",
  },
  {
    ref: "§5 Difference of squares",
    text:
      "An expression of the form a^2 - b^2 factors as (a - b)(a + b). Example: x^2 - 49 = " +
      "(x - 7)(x + 7). This gives two roots with the same size and opposite signs.",
  },
  {
    ref: "§6 Checking and word problems",
    text:
      "Check every root by substituting it into the ORIGINAL equation. In word problems, write " +
      "down what the variable means, build the equation from the situation, and then decide " +
      "whether each root makes sense. A negative length or time is not a valid answer, so state " +
      "why you reject it.",
  },
];

const level = (label: string, points: number, description: string): RubricLevel => ({
  label,
  points,
  description,
});

const rubric = [
  {
    name: "Factoring",
    description: "Rewrites each quadratic as a correct product of factors.",
    levels: [
      level("Exemplary", 3, "All quadratics are in standard form and factored correctly."),
      level("Proficient", 2, "Most factored correctly; minor sign errors."),
      level("Developing", 1, "Attempts factoring but with frequent errors."),
      level("Beginning", 0, "No factoring shown."),
    ],
  },
  {
    name: "Finds all roots",
    description: "Applies the zero product property to every factor.",
    levels: [
      level("Exemplary", 3, "Finds every root of every equation."),
      level("Proficient", 2, "Misses a root on one problem."),
      level("Developing", 1, "Regularly stops after the first root."),
      level("Beginning", 0, "Roots missing or incorrect."),
    ],
  },
  {
    name: "Checks and interprets",
    description: "Substitutes roots back in and rejects roots that don't fit the context.",
    levels: [
      level("Exemplary", 3, "Checks all roots and justifies rejecting invalid ones in problem 5."),
      level("Proficient", 2, "Checks most roots; context reasoning is brief."),
      level("Developing", 1, "Little checking; context not considered."),
      level("Beginning", 0, "No checking or interpretation."),
    ],
  },
  {
    name: "Explains reasoning",
    description: "Uses clear steps and math vocabulary (factor, root, zero product property).",
    levels: [
      level("Exemplary", 3, "Every step is clear and uses correct vocabulary."),
      level("Proficient", 2, "Steps are mostly clear."),
      level("Developing", 1, "Steps are hard to follow."),
      level("Beginning", 0, "Only final answers given."),
    ],
  },
];

const questions = [
  "Why do we need the equation to equal zero before we use the factors to find the roots?",
  "Most of these equations had two answers. Explain where the second answer comes from.",
  "In the rectangle problem, one solution was not a valid width. How did you decide which one to keep?",
];

async function main() {
  const existing = await db.query.classes.findFirst({
    where: eq(classes.joinCode, DEMO_JOIN_CODE),
  });
  if (existing) {
    // Cascades to the class, students, assignments and everything below them.
    await db.delete(teachers).where(eq(teachers.id, existing.teacherId));
    console.info("Removed previous demo data.");
  }

  await db.transaction(async (tx) => {
    const [teacher] = await tx
      .insert(teachers)
      .values({ displayName: "Ms. Rivera" })
      .returning();
    const [klass] = await tx
      .insert(classes)
      .values({ teacherId: teacher!.id, name: "Algebra I — Period 3", joinCode: DEMO_JOIN_CODE })
      .returning();

    const [assignment] = await tx
      .insert(assignments)
      .values({
        classId: klass!.id,
        title: "Solving Quadratics by Factoring",
        subject: "Algebra I",
        gradeLevel: "9",
        instructions:
          "Solve each equation by factoring. Show every step, find ALL solutions, and check them " +
          "in the original equation. For problem 5, explain which solution makes sense and why.",
        problems,
        helpLevel: 2,
        endCheckEnabled: true,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const [notes] = await tx
      .insert(sources)
      .values({
        assignmentId: assignment!.id,
        kind: "text",
        title: "Unit 4 Notes: Solving Quadratics by Factoring",
        extractedText: notesSections.map((s) => `${s.ref}\n${s.text}`).join("\n\n"),
      })
      .returning();
    await tx
      .insert(sourceChunks)
      .values(notesSections.map((s, i) => ({ sourceId: notes!.id, ref: s.ref, ordinal: i, text: s.text })));

    const [rub] = await tx.insert(rubrics).values({ assignmentId: assignment!.id }).returning();
    await tx
      .insert(rubricCriteria)
      .values(rubric.map((c, i) => ({ ...c, rubricId: rub!.id, ordinal: i })));

    await tx.insert(checkQuestions).values(
      questions.map((text, i) => ({
        assignmentId: assignment!.id,
        text,
        ordinal: i,
        origin: "teacher" as const,
        approved: true,
      })),
    );

    await tx
      .insert(students)
      .values(["Avery", "Jordan", "Sam"].map((displayName) => ({ classId: klass!.id, displayName })));
  });

  console.info(`Seeded demo class. Join code: ${DEMO_JOIN_CODE}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
