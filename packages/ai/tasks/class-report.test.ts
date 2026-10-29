import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { ClassReportOutput } from "../prompts/class-report";
import { fakeToolCalls } from "../provider/fake";
import { FAKE_FIXTURES } from "../provider/fake-fixtures";
import { consoleModelCallLogger, setModelCallLogger } from "../provider/logging";
import { type ClassReportData, canonicalLabel, quoteFound, runClassReport, verifyClassReport } from "./class-report";

const corpus = new Map([
  ["Student 01", "Problem 2: (x + 5)(x - 3) = 0 so x = 3. Do I need two answers?"],
  ["Student 02", "Problem 3: I divided both sides by x so x = 4."],
  ["Student 03", "All done, both roots checked."],
]);

const output = (over: Partial<ClassReportOutput> = {}): ClassReportOutput => ({
  summary: "Most students stop after one root.",
  misconceptions: [
    {
      title: "Stops after the first root",
      explanation: "Sets only one factor to zero.",
      problemIds: ["2"],
      students: ["student 1", "Student 9"],
      evidence: [
        { student: "Student 01", quote: "so x = 3" },
        { student: "Student 03", quote: "I only found one" },
      ],
    },
    {
      title: "Made-up pattern",
      explanation: "No real students.",
      problemIds: [],
      students: ["Student 42"],
      evidence: [],
    },
    {
      title: "Divides by x",
      explanation: "Loses x = 0.",
      problemIds: ["3"],
      students: [],
      evidence: [{ student: "Student 2", quote: "“I divided both sides by x …x = 4”" }],
    },
  ],
  sourceSections: [{ ref: "§2", why: "Most questions" }],
  reteachPlan: {
    goal: "Find every root",
    steps: [
      { minutes: 10, activity: "Warm-up", addresses: [1, 2] },
      { minutes: 15, activity: "Common factor", addresses: [3] },
    ],
    exitTicket: "How many roots?",
  },
  studentNotes: [
    { student: "Student 01", note: "Second root" },
    { student: "Somebody", note: "?" },
  ],
  ...over,
});

describe("verifyClassReport", () => {
  it("normalizes labels", () => {
    assert.equal(canonicalLabel("student 7"), "Student 07");
    assert.equal(canonicalLabel("STUDENT 007"), "Student 07");
    assert.equal(canonicalLabel("Avery"), null);
  });

  it("matches quotes word for word, across ellipses and curly quotes, and nothing else", () => {
    assert.ok(quoteFound("“I divided both sides by x …x = 4”", corpus.get("Student 02")!));
    assert.ok(!quoteFound("I divided by 2", corpus.get("Student 02")!));
    assert.ok(!quoteFound("...", corpus.get("Student 02")!));
  });

  it("keeps only real students and verified quotes, and counts from them", () => {
    const report = verifyClassReport(output(), corpus);
    assert.deepEqual(
      report.misconceptions.map((m) => [m.title, m.students]),
      [
        ["Stops after the first root", ["Student 01"]],
        // Listed no students, but a verified quote proves Student 02.
        ["Divides by x", ["Student 02"]],
      ],
    );
    assert.equal(report.misconceptions[0]!.evidence.length, 1);
    assert.deepEqual(report.verification, { droppedQuotes: 1, droppedStudentRefs: 3, droppedMisconceptions: 1, addedByRecount: 0 });
    assert.deepEqual(report.studentNotes, [{ student: "Student 01", note: "Second root" }]);
  });

  it("adds recounted students only when their quote is in their own work", () => {
    const recounts = [
      {
        students: [
          { student: "Student 03", quote: "both roots checked" }, // real quote: added
          { student: "Student 02", quote: "x = 3" }, // not in Student 02's work: dropped
          { student: "Student 77", quote: "x" }, // unknown student: dropped
        ],
      },
      null, // that recount call failed
      { students: [] },
    ];
    const report = verifyClassReport(output(), corpus, recounts);
    assert.deepEqual(report.misconceptions[0]!.students, ["Student 01", "Student 03"]);
    assert.equal(report.verification.addedByRecount, 1);
    assert.equal(report.verification.droppedQuotes, 2);
  });

  it("uses recount quotes as evidence when the report had none", () => {
    const out = output();
    out.misconceptions[0]!.evidence = [];
    const report = verifyClassReport(out, corpus, [{ students: [{ student: "Student 01", quote: "Do I need two answers" }] }]);
    assert.deepEqual(report.misconceptions[0]!.evidence, [{ student: "Student 01", quote: "Do I need two answers" }]);
  });

  it("renumbers reteach steps after a misconception is dropped", () => {
    const report = verifyClassReport(output(), corpus);
    assert.deepEqual(
      report.reteachPlan.steps.map((s) => s.addresses),
      [[1], [2]],
    );
  });
});

describe("runClassReport (FAKE stub)", () => {
  const savedEnv = { ...process.env };
  const saved = { investigate: FAKE_FIXTURES["report.investigate"], write: FAKE_FIXTURES["report.write"] };

  beforeEach(() => {
    process.env.AI_PROVIDER = "FAKE";
    delete process.env.NODE_ENV;
    setModelCallLogger(() => {});
    mock.method(console, "warn", () => {});
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    FAKE_FIXTURES["report.investigate"] = saved.investigate!;
    FAKE_FIXTURES["report.write"] = saved.write!;
    setModelCallLogger(consoleModelCallLogger);
    mock.restoreAll();
  });

  const calls: string[] = [];
  const data: ClassReportData = {
    overview: async () => (calls.push("overview"), { students: 3 }),
    studentWork: async (s) => {
      calls.push(`work:${s}`);
      if (s === "Student 09") throw new Error("No student with that label.");
      return { draft: corpus.get(s) };
    },
    search: async (terms) => (calls.push(`search:${terms.join(",")}`), { matches: [] }),
    rubricCriterion: async (n) => (calls.push(`criterion:${n}`), {}),
    comprehensionQuestion: async (n) => (calls.push(`question:${n}`), {}),
    sourceSectionUsage: async () => (calls.push("sections"), {}),
    corpus: async () => corpus,
  };
  const context = {
    assignment: { title: "Quadratics", subject: "Algebra I", gradeLevel: "9", instructions: "Solve." },
    problems: [{ id: "2", prompt: "Solve x^2 + 2x - 15 = 0.", answerKey: "x = 3 or x = -5" }],
    sourceSections: ["§2 Zero product property"],
    rubricCriteria: ["Finds all roots"],
    checkQuestions: [],
    studentCount: 3,
  };

  it("runs the tools the model asks for, returns errors to it, and verifies the report", async () => {
    calls.length = 0;
    let turn = 0;
    FAKE_FIXTURES["report.investigate"] = (messages) => {
      turn++;
      if (turn === 1)
        return fakeToolCalls([
          { name: "class_overview", arguments: {} },
          { name: "search_class_work", arguments: { terms: ["x ="] } },
        ]);
      if (turn === 2)
        return fakeToolCalls([
          { name: "get_student_work", arguments: { student: "Student 09" } },
          { name: "get_rubric_criterion", arguments: { criterion: "one" } },
        ]);
      // The previous tool results are in the history, errors included.
      const last = messages.at(-1)!;
      assert.equal(last.role, "tool");
      assert.match(String(last.content), /Invalid arguments/);
      return "Done investigating.";
    };
    FAKE_FIXTURES["report.write"] = output();

    const run = await runClassReport(context, data);
    assert.deepEqual(calls, ["overview", "search:x =", "work:Student 09"]);
    assert.deepEqual(
      run.steps.map((s) => [s.tool, s.ok]),
      [
        ["class_overview", true],
        ["search_class_work", true],
        ["get_student_work", false],
        ["get_rubric_criterion", false],
      ],
    );
    assert.equal(run.rounds, 3);
    assert.equal(run.finishedInvestigating, true);
    assert.equal(run.report.misconceptions.length, 2);
  });

  it("stops at the tool budget and still writes a report", async () => {
    calls.length = 0;
    FAKE_FIXTURES["report.investigate"] = () =>
      fakeToolCalls(Array.from({ length: 5 }, () => ({ name: "class_overview", arguments: {} })));
    FAKE_FIXTURES["report.write"] = output();

    const run = await runClassReport(context, data);
    assert.equal(run.steps.length, 16);
    assert.equal(calls.length, 16);
    assert.equal(run.finishedInvestigating, false);
    assert.equal(run.report.misconceptions.length, 2);
  });
});
