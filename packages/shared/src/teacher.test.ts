import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssignmentInput } from "./teacher";

// The exact shape the dashboard's assignment form submits.
const formPayload = {
  title: "Factoring practice",
  subject: "Algebra I",
  gradeLevel: "9",
  instructions: "Factor and solve each equation.",
  dueAt: "2026-11-03T22:00:00.000Z",
  problems: [{ prompt: "Solve x^2 + 7x + 12 = 0.", answerKey: "x = -3 or x = -4" }, { prompt: "Solve x^2 = 4." }],
  helpLevel: 3,
  allowlist: ["docs.google.com/document/*", "https://www.khanacademy.org/math/*"],
  endCheckEnabled: true,
};

describe("AssignmentInput", () => {
  it("accepts the form payload (problems have no ids yet) and normalizes the allowlist", () => {
    const parsed = AssignmentInput.parse(formPayload);
    assert.equal(parsed.problems.length, 2);
    assert.deepEqual(parsed.allowlist, ["docs.google.com/document/*", "www.khanacademy.org/math/*"]);
  });

  it("rejects out-of-range help levels and empty prompts", () => {
    assert.equal(AssignmentInput.safeParse({ ...formPayload, helpLevel: 5 }).success, false);
    assert.equal(AssignmentInput.safeParse({ ...formPayload, problems: [{ prompt: " " }] }).success, false);
  });
});
