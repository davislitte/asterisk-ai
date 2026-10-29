import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { complete } from "./client";
import { ModelCallError, SPEND_CAP_MESSAGE } from "./errors";
import { type ModelCallLogEntry, consoleModelCallLogger, setModelCallLogger } from "./logging";
import { estimateUsd } from "./pricing";
import { SpendCapReachedError, setSpendGuard } from "./spend-guard";

describe("spend guard", () => {
  const savedEnv = { ...process.env };
  let logged: ModelCallLogEntry[];

  beforeEach(() => {
    logged = [];
    setModelCallLogger((e) => {
      logged.push(e);
    });
    mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    setSpendGuard(null);
    setModelCallLogger(consoleModelCallLogger);
    mock.restoreAll();
  });

  it("blocks a real call before any network request, and logs the attempt", async () => {
    process.env.AI_PROVIDER = "META_API";
    process.env.MODEL_API_KEY = "test-key-not-real";
    const fetchMock = mock.method(globalThis, "fetch", () => {
      throw new Error("must not be called");
    });
    setSpendGuard(() => {
      throw new SpendCapReachedError();
    });

    await assert.rejects(complete({ purpose: "tutor.reply", messages: [{ role: "user", content: "hi" }] }), (err) => {
      assert.ok(err instanceof ModelCallError);
      assert.equal(err.spendCapReached, true);
      assert.equal(err.retryable, false);
      assert.equal(err.userMessage, SPEND_CAP_MESSAGE);
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(logged.length, 1);
    assert.equal(logged[0]!.ok, false);
  });

  it("doesn't apply to the free FAKE stub", async () => {
    process.env.AI_PROVIDER = "FAKE";
    delete process.env.NODE_ENV;
    const guard = mock.fn(() => {
      throw new SpendCapReachedError();
    });
    setSpendGuard(guard);
    const out = await complete({ purpose: "x", messages: [{ role: "user", content: "hi" }] });
    assert.ok(out.text.length > 0);
    assert.equal(guard.mock.callCount(), 0);
  });

  it("prices tokens at the Muse Spark list price", () => {
    assert.equal(estimateUsd(1_000_000, 0), 1.25);
    assert.equal(estimateUsd(0, 1_000_000), 4.25);
  });
});
