import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { z } from "zod";
import { complete, completeJson } from "./client";
import { resolveProviderConfig } from "./config";
import { fakeChatCompletion, sampleFromSchema } from "./fake";
import { type ModelCallLogEntry, consoleModelCallLogger, setModelCallLogger } from "./logging";

describe("FAKE provider (dev-only test stub)", () => {
  const savedEnv = { ...process.env };
  let logged: ModelCallLogEntry[];

  beforeEach(() => {
    process.env.AI_PROVIDER = "FAKE";
    delete process.env.NODE_ENV;
    logged = [];
    setModelCallLogger((entry) => {
      logged.push(entry);
    });
    mock.method(globalThis, "fetch", () => {
      throw new Error("FAKE provider must never touch the network");
    });
    mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    setModelCallLogger(consoleModelCallLogger);
    mock.restoreAll();
  });

  it("is rejected when NODE_ENV is production", () => {
    assert.throws(
      () => resolveProviderConfig({ AI_PROVIDER: "FAKE", NODE_ENV: "production" }),
      /dev-only test stub/,
    );
    process.env.NODE_ENV = "production";
    assert.throws(() => fakeChatCompletion({ purpose: "x" }), /dev-only test stub/);
  });

  it("returns a text completion without calling fetch, warns, and logs the call", async () => {
    const result = await complete({
      purpose: "test.text",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(result.provider, "FAKE");
    assert.equal(result.model, "fake-test-stub");
    assert.match(result.text, /\[FAKE MODEL\]/);
    assert.equal(result.finishReason, "stop");
    assert.equal((globalThis.fetch as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
    assert.equal((console.warn as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    assert.equal(logged.length, 1);
    assert.equal(logged[0]!.provider, "FAKE");
    assert.equal(logged[0]!.ok, true);
  });

  it("returns structured output that satisfies the requested schema", async () => {
    const Schema = z.strictObject({
      flag: z.enum(["on_topic", "off_topic"]),
      score: z.number().int().min(1).max(4),
      items: z.array(z.object({ name: z.string(), ok: z.boolean() })).min(2),
      note: z.string().nullable(),
    });

    const result = await completeJson({
      purpose: "test.json",
      messages: [{ role: "user", content: "classify" }],
      schemaName: "test",
      schema: Schema,
    });

    assert.deepEqual(result.data, {
      flag: "on_topic",
      score: 1,
      items: [
        { name: "[FAKE] name", ok: false },
        { name: "[FAKE] name", ok: false },
      ],
      note: "[FAKE] note",
    });
  });

  it("samples nested schemas", () => {
    assert.deepEqual(
      sampleFromSchema({ type: "object", properties: { a: { type: "array", items: { const: 7 } } } }),
      { a: [7] },
    );
  });
});
