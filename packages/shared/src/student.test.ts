import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudentAssignment, type TeacherAssignmentLike, toStudentAssignment } from "./student";

const teacherRow: TeacherAssignmentLike & { classId: string; createdAt: Date; className: string } = {
  id: "a1",
  classId: "c1",
  className: "Algebra I",
  title: "Solving Quadratics by Factoring",
  subject: "Algebra I",
  gradeLevel: "9",
  instructions: "Solve each equation by factoring.",
  dueAt: new Date("2026-11-03T15:00:00Z"),
  helpLevel: 2,
  allowlist: ["docs.google.com/document/*"],
  endCheckEnabled: true,
  createdAt: new Date(),
  problems: [
    { id: "1", prompt: "Solve x^2 - 5x + 6 = 0 by factoring.", answerKey: "x = 2 or x = 3" },
    { id: "2", prompt: "Solve x^2 - 9 = 0 by factoring.", answerKey: "x = 3 or x = -3" },
    { id: "3", prompt: "Explain why we set each factor to zero." },
  ],
};

describe("toStudentAssignment", () => {
  it("drops every answer key and keeps the problem prompts", () => {
    const view = toStudentAssignment(teacherRow);
    const json = JSON.stringify(view);

    assert.ok(!json.includes("answerKey"));
    assert.ok(!json.includes("x = 2 or x = 3"));
    assert.ok(!json.includes("x = 3 or x = -3"));
    assert.deepEqual(view.problems, [
      { id: "1", prompt: "Solve x^2 - 5x + 6 = 0 by factoring." },
      { id: "2", prompt: "Solve x^2 - 9 = 0 by factoring." },
      { id: "3", prompt: "Explain why we set each factor to zero." },
    ]);
  });

  it("only exposes allowlisted fields", () => {
    const view = toStudentAssignment(teacherRow);
    assert.deepEqual(Object.keys(view).sort(), [
      "allowlist",
      "dueAt",
      "endCheckEnabled",
      "gradeLevel",
      "helpLevel",
      "id",
      "instructions",
      "problems",
      "subject",
      "title",
    ]);
    assert.equal(view.dueAt, "2026-11-03T15:00:00.000Z");
  });

  it("rejects a student payload that smuggles an answer key", () => {
    const smuggled = { ...toStudentAssignment(teacherRow) };
    smuggled.problems = [{ id: "1", prompt: "p", answerKey: "x = 2" } as never];
    assert.equal(StudentAssignment.safeParse(smuggled).success, false);
  });
});
