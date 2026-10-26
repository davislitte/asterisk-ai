import { toStudentAssignment } from "@asterisk/shared";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";
import { StudentPayloadLeakError, assertNoAnswerKeys, studentJson } from "./student-response";

const teacherAssignment = {
  id: "a1",
  title: "Solving Quadratics by Factoring",
  subject: "Algebra I",
  gradeLevel: "9",
  instructions: "Solve each equation.",
  dueAt: null,
  helpLevel: 2,
  allowlist: ["docs.google.com/document/*"],
  endCheckEnabled: true,
  problems: [{ id: "1", prompt: "Solve x^2 - 5x + 6 = 0.", answerKey: "x = 2 or x = 3" }],
};

describe("student API boundary", () => {
  it("sends the sanitized assignment without answer keys", async () => {
    const res = studentJson({ assignment: toStudentAssignment(teacherAssignment) });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(!body.includes("answerKey"));
    assert.ok(!body.includes("x = 2 or x = 3"));
    assert.match(body, /Solve x\^2 - 5x \+ 6 = 0\./);
  });

  it("refuses to send a raw teacher row, however deeply nested", async () => {
    mock.method(console, "error", () => {});
    try {
      const res = studentJson({ data: { assignments: [teacherAssignment] } });
      assert.equal(res.status, 500);
      const body = await res.text();
      assert.ok(!body.includes("x = 2 or x = 3"));
      assert.throws(() => assertNoAnswerKeys({ a: [{ b: { answer_key: "x" } }] }), StudentPayloadLeakError);
    } finally {
      mock.restoreAll();
    }
  });

  it("every student route responds via studentJson and never loads teacher assignments", () => {
    const root = path.join(import.meta.dirname, "..", "app", "api", "student");
    const files = existsSync(root) ? listFiles(root).filter((f) => /\.(ts|tsx)$/.test(f)) : [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(root, file);
      assert.ok(!/\b(Response|NextResponse)\.json\(/.test(src), `${rel}: use studentJson() instead of Response.json()`);
      assert.ok(!/new (Response|NextResponse)\(/.test(src), `${rel}: use studentJson() instead of new Response()`);
      assert.ok(!src.includes("getAssignmentForTeacher"), `${rel}: student routes must not load teacher assignments`);
      if (path.basename(file).startsWith("route.")) {
        assert.ok(src.includes("studentJson("), `${rel}: respond with studentJson()`);
      }
    }
  });
});

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
