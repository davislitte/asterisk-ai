import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAT_LIMITS, InFlight, RUBRIC_CHECK_LIMITS, exceededLimit } from "./rate-limits";

describe("rate limits", () => {
  it("allows requests under every window", () => {
    assert.equal(exceededLimit(CHAT_LIMITS, [7, 149]), null);
    assert.equal(exceededLimit(RUBRIC_CHECK_LIMITS, [5, 19]), null);
  });

  it("blocks at each window's max, reporting the first one hit", () => {
    assert.equal(exceededLimit(CHAT_LIMITS, [8, 10]), CHAT_LIMITS[0]);
    assert.equal(exceededLimit(CHAT_LIMITS, [0, 150]), CHAT_LIMITS[1]);
    assert.equal(exceededLimit(RUBRIC_CHECK_LIMITS, [6, 6]), RUBRIC_CHECK_LIMITS[0]);
  });

  it("allows one request at a time per key", () => {
    const flight = new InFlight();
    assert.equal(flight.acquire("chat:s1"), true);
    assert.equal(flight.acquire("chat:s1"), false);
    assert.equal(flight.acquire("chat:s2"), true);
    flight.release("chat:s1");
    assert.equal(flight.acquire("chat:s1"), true);
  });
});
