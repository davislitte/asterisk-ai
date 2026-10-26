import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeSessionToken, encodeSessionToken, passcodeMatches } from "./session-token";

const SECRET = "x".repeat(32);
const ID = "3f6c1d2e-9a4b-4c5d-8e7f-0a1b2c3d4e5f";

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const token = encodeSessionToken(ID, Date.now() + 60_000, SECRET);
    assert.equal(decodeSessionToken(token, SECRET), ID);
  });

  it("rejects expired, tampered and foreign-secret tokens", () => {
    const expired = encodeSessionToken(ID, Date.now() - 1, SECRET);
    assert.equal(decodeSessionToken(expired, SECRET), null);

    const token = encodeSessionToken(ID, Date.now() + 60_000, SECRET);
    const [, expires, sig] = token.split(".");
    const otherId = "00000000-0000-4000-8000-000000000000";
    assert.equal(decodeSessionToken(`${otherId}.${expires}.${sig}`, SECRET), null);
    assert.equal(decodeSessionToken(token, "y".repeat(32)), null);
    assert.equal(decodeSessionToken("garbage", SECRET), null);
  });

  it("compares passcodes exactly", () => {
    assert.ok(passcodeMatches("open sesame", "open sesame"));
    assert.ok(!passcodeMatches("open sesame ", "open sesame"));
    assert.ok(!passcodeMatches("", "open sesame"));
  });
});
