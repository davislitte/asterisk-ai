import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { rubricImportPromptV1 } from "../prompts/rubric-import";
import { consoleModelCallLogger, setModelCallLogger } from "../provider/logging";
import { importRubric } from "./import-rubric";

describe("importRubric", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_PROVIDER = "FAKE";
    delete process.env.NODE_ENV;
    setModelCallLogger(() => {});
    mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    setModelCallLogger(consoleModelCallLogger);
    mock.restoreAll();
  });

  it("returns schema-valid criteria through the provider (FAKE stub)", async () => {
    const rubric = await importRubric("Accuracy: 3 all correct / 0 none");
    assert.ok(rubric.criteria.length > 0);
    for (const c of rubric.criteria) {
      assert.ok(c.levels.length > 0);
      assert.ok(c.levels.every((l) => Number.isInteger(l.points) && l.points >= 0));
    }
  });

  it("fences the teacher's text as data and caps its length", () => {
    const messages = rubricImportPromptV1(`${"a".repeat(50_000)}`);
    const user = messages.find((m) => m.role === "user")!.content as string;
    assert.match(user, /^<rubric>\n/);
    assert.ok(user.length < 41_000);
  });
});
