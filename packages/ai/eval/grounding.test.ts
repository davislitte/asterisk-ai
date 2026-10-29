import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groundingJudgePromptV1 } from "../prompts/grounding-judge";
import { EVAL_SOURCES } from "./fixture";
import { GROUNDING_CASES, GROUNDING_CONTROLS } from "./grounding-cases";

describe("grounding eval setup", () => {
  it("expects citations only to sections that exist", () => {
    const labels = new Set(EVAL_SOURCES.map((s) => s.label));
    for (const c of GROUNDING_CASES) {
      if (c.kind === "on") assert.ok(c.expectLabels?.length, `${c.id} needs expected labels`);
      for (const l of c.expectLabels ?? []) assert.ok(labels.has(l), `${c.id}: unknown label ${l}`);
    }
  });

  it("has both kinds of cases and both kinds of judge controls", () => {
    assert.ok(GROUNDING_CASES.some((c) => c.kind === "off") && GROUNDING_CASES.some((c) => c.kind === "on"));
    assert.ok(GROUNDING_CONTROLS.some((c) => c.outside) && GROUNDING_CONTROLS.some((c) => !c.outside));
    assert.equal(new Set(GROUNDING_CASES.map((c) => c.id)).size, GROUNDING_CASES.length, "unique case ids");
  });

  it("gives the judge every note section and fences the reply as data", () => {
    const [instructions, user] = groundingJudgePromptV1({ sources: EVAL_SOURCES, studentMessage: "q", reply: "r" });
    for (const s of EVAL_SOURCES) assert.ok(String(instructions!.content).includes(s.text));
    assert.match(String(user!.content), /<tutor_reply>\nr\n<\/tutor_reply>/);
  });
});
