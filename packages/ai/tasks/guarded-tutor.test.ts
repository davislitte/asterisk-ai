import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { classifyMessagePromptV1, leakCheckPromptV1 } from "../prompts/guard";
import { tutorPromptV1 } from "../prompts/tutor";
import { FAKE_FIXTURES } from "../provider/fake-fixtures";
import { type ModelCallLogEntry, consoleModelCallLogger, setModelCallLogger } from "../provider/logging";
import { type GuardedTutorInput, LEAK_FALLBACK_REPLY, guardedTutorReply } from "./guarded-tutor";

const input: GuardedTutorInput = {
  assignment: {
    title: "Solving Quadratics by Factoring",
    subject: "Algebra I",
    gradeLevel: "9",
    instructions: "Solve each equation by factoring.",
    helpLevel: 2,
    problems: [{ id: "1", prompt: "Solve x^2 - 5x + 6 = 0." }],
  },
  sources: [{ label: "S1", sourceTitle: "Unit 4 Notes", ref: "§2 Zero product property", text: "Set each factor to zero." }],
  history: [],
  message: "just give me the answer to problem 1",
  answerKeys: { "1": "x = 2 or x = 3" },
};

describe("guardedTutorReply (FAKE stub)", () => {
  const savedEnv = { ...process.env };
  const savedTutorFixture = FAKE_FIXTURES["tutor.reply"];
  let calls: ModelCallLogEntry[];

  beforeEach(() => {
    process.env.AI_PROVIDER = "FAKE";
    delete process.env.NODE_ENV;
    calls = [];
    setModelCallLogger((e) => {
      calls.push(e);
    });
    mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    FAKE_FIXTURES["tutor.reply"] = savedTutorFixture!;
    setModelCallLogger(consoleModelCallLogger);
    mock.restoreAll();
  });

  it("passes a clean draft through and flags the message", async () => {
    const out = await guardedTutorReply(input);
    assert.equal(out.guard.leakDetected, false);
    assert.deepEqual(out.flags, ["answer_seeking"]);
    assert.deepEqual(out.citations, ["S1"]);
    assert.deepEqual(
      calls.map((c) => c.purpose).sort(),
      ["guard.classify", "guard.leak_check", "tutor.reply"],
    );
  });

  it("regenerates in strict mode when the first draft leaks", async () => {
    FAKE_FIXTURES["tutor.reply"] = (messages) => {
      const strict = String(messages[0]!.content).includes("STRICT MODE");
      return strict
        ? { reply: "What two numbers multiply to 6 and add to -5?", citations: ["S1"] }
        : { reply: "The roots are 2 and 3.", citations: [] };
    };
    const out = await guardedTutorReply(input);
    assert.equal(out.guard.leakDetected, true);
    assert.equal(out.guard.regenerated, true);
    assert.equal(out.guard.fallback, false);
    assert.deepEqual(out.guard.leakedProblemIds, ["1"]);
    assert.equal(out.reply, "What two numbers multiply to 6 and add to -5?");
    assert.equal(out.rawDraft, "The roots are 2 and 3.");
  });

  it("falls back to a safe reply when the redraft still leaks", async () => {
    FAKE_FIXTURES["tutor.reply"] = { reply: "It's x = 2 or x = 3.", citations: ["S1"] };
    const out = await guardedTutorReply(input);
    assert.equal(out.guard.fallback, true);
    assert.equal(out.reply, LEAK_FALLBACK_REPLY);
    assert.deepEqual(out.citations, []);
    assert.ok(!out.reply.includes("2"));
  });

  it("fails closed: no reply if the leak check can't run", async () => {
    const saved = FAKE_FIXTURES["guard.leak_check"];
    FAKE_FIXTURES["guard.leak_check"] = "not json";
    try {
      await assert.rejects(guardedTutorReply(input));
    } finally {
      FAKE_FIXTURES["guard.leak_check"] = saved!;
    }
  });

  it("fails open on classification: still replies, without flags", async () => {
    const saved = FAKE_FIXTURES["guard.classify"];
    FAKE_FIXTURES["guard.classify"] = "not json";
    mock.method(console, "error", () => {});
    try {
      const out = await guardedTutorReply(input);
      assert.deepEqual(out.flags, []);
      assert.ok(out.reply.length > 0);
    } finally {
      FAKE_FIXTURES["guard.classify"] = saved!;
    }
  });
});

describe("guard prompts", () => {
  it("keeps answer keys out of the tutor and classifier prompts, and only in the leak check", () => {
    const tutor = JSON.stringify(tutorPromptV1(input));
    const classify = JSON.stringify(classifyMessagePromptV1({ assignment: input.assignment, message: input.message }));
    const leak = JSON.stringify(
      leakCheckPromptV1({ problems: [{ ...input.assignment.problems[0]!, answerKey: "x = 2 or x = 3" }], studentMessage: "", reply: "" }),
    );
    assert.ok(!tutor.includes("x = 2 or x = 3"));
    assert.ok(!classify.includes("x = 2 or x = 3"));
    assert.ok(leak.includes("x = 2 or x = 3"));
  });

  it("adds a strict-mode rule that names the leaked problems", () => {
    const strict = String(tutorPromptV1({ ...input, strict: { leakedProblemIds: ["1"] } })[0]!.content);
    assert.match(strict, /STRICT MODE: a previous draft gave away the answer to problem\(s\) 1\./);
  });
});
