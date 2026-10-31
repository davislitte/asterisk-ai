import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { z } from "zod";
import { setProviderResolver } from "./active-provider";
import { complete, completeJson } from "./client";
import { resolveProviderConfig, wireReasoningEffort } from "./config";
import { consoleModelCallLogger, setModelCallLogger } from "./logging";
import { setSpendGuard } from "./spend-guard";

describe("reasoning effort per provider", () => {
  const meta = resolveProviderConfig({ AI_PROVIDER: "META_API", MODEL_API_KEY: "test-key-not-real" });
  const open = resolveProviderConfig({ AI_PROVIDER: "BASETEN", BASETEN_API_KEY: "test-key-not-real" });

  it("passes every effort through on Muse Spark", () => {
    for (const e of ["minimal", "low", "xhigh", "max"] as const) assert.equal(wireReasoningEffort(meta, e), e);
  });

  it("clamps to low..xhigh on Muse Spark Open, which rejects the rest", () => {
    assert.equal(wireReasoningEffort(open, "minimal"), "low");
    assert.equal(wireReasoningEffort(open, "medium"), "medium");
    assert.equal(wireReasoningEffort(open, "max"), "xhigh");
    assert.equal(wireReasoningEffort(open, undefined), undefined);
  });

  it("serves Spark Open on Baseten with the system role", () => {
    assert.equal(open.model, "meta-models/muse-spark-open");
    assert.equal(open.instructionRole, "system");
  });
});

describe("provider resolver", () => {
  const savedEnv = { ...process.env };
  let sent: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    process.env.AI_PROVIDER = "META_API";
    process.env.MODEL_API_KEY = "test-key-not-real";
    process.env.BASETEN_API_KEY = "test-key-not-real";
    sent = [];
    setModelCallLogger(() => {});
    setSpendGuard(null);
    mock.method(globalThis, "fetch", async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }), {
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    setProviderResolver(null);
    setModelCallLogger(consoleModelCallLogger);
    mock.restoreAll();
  });

  it("uses AI_PROVIDER when no resolver is installed", async () => {
    const res = await complete({ purpose: "test", messages: [{ role: "user", content: "hi" }], reasoningEffort: "minimal" });
    assert.equal(res.provider, "META_API");
    assert.match(sent[0]!.url, /^https:\/\/api\.meta\.ai\/v1\//);
    assert.equal(sent[0]!.body.reasoning_effort, "minimal");
  });

  it("sends calls where the resolver says, with that host's effort and role", async () => {
    setProviderResolver(() => "BASETEN");
    const res = await complete({
      purpose: "test",
      messages: [
        { role: "instructions", content: "rules" },
        { role: "user", content: "hi" },
      ],
      reasoningEffort: "minimal",
    });
    assert.equal(res.provider, "BASETEN");
    assert.match(sent[0]!.url, /^https:\/\/inference\.baseten\.co\/v1\//);
    assert.equal(sent[0]!.body.model, "meta-models/muse-spark-open");
    assert.equal(sent[0]!.body.reasoning_effort, "low");
    assert.deepEqual((sent[0]!.body.messages as { role: string }[]).map((m) => m.role), ["system", "user"]);
  });

  it("asks Spark Open for json_object with the schema in the instructions, Muse Spark for json_schema", async () => {
    mock.restoreAll();
    mock.method(globalThis, "fetch", async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const req = {
      purpose: "test",
      messages: [
        { role: "instructions" as const, content: "rules" },
        { role: "user" as const, content: "hi" },
      ],
      schemaName: "s",
      schema: z.strictObject({ ok: z.boolean() }),
    };
    setProviderResolver(() => "BASETEN");
    assert.deepEqual((await completeJson(req)).data, { ok: true });
    const open = sent[0]!.body;
    assert.deepEqual(open.response_format, { type: "json_object" });
    const system = (open.messages as { role: string; content: string }[])[0]!;
    assert.equal(system.role, "system");
    assert.match(system.content, /^rules\n\nReply with only a JSON object[\s\S]*"ok"/);

    setProviderResolver(() => "META_API");
    await completeJson(req);
    const meta = sent[1]!.body;
    assert.equal((meta.response_format as { type: string }).type, "json_schema");
    assert.equal((meta.messages as { content: string }[])[0]!.content, "rules");
  });

  it("falls back to AI_PROVIDER when the resolver returns undefined, and a request's own provider wins", async () => {
    setProviderResolver(async () => undefined);
    assert.equal((await complete({ purpose: "test", messages: [{ role: "user", content: "hi" }] })).provider, "META_API");
    setProviderResolver(() => "BASETEN");
    const forced = await complete({ purpose: "test", messages: [{ role: "user", content: "hi" }], provider: "META_API" });
    assert.equal(forced.provider, "META_API");
  });
});
