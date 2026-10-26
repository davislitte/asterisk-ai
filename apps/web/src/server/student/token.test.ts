import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeSessionToken } from "../session-token";
import { bearerToken, issueStudentToken, verifyStudentToken } from "./token";

const SECRET = "s".repeat(40);
const ID = "11111111-2222-4333-8444-555555555555";

describe("student tokens", () => {
  it("round-trips and expires", () => {
    const token = issueStudentToken(ID, SECRET, 0);
    assert.equal(verifyStudentToken(token, SECRET, 1000), ID);
    assert.equal(verifyStudentToken(token, SECRET, 31 * 24 * 60 * 60 * 1000), null);
  });

  it("does not accept a teacher session token, and vice versa", () => {
    const teacherToken = encodeSessionToken(ID, Date.now() + 60_000, SECRET);
    assert.equal(verifyStudentToken(teacherToken, SECRET), null);
  });

  it("reads Bearer tokens only", () => {
    const req = (auth?: string) => new Request("http://x", { headers: auth ? { authorization: auth } : {} });
    assert.equal(bearerToken(req("Bearer abc.def")), "abc.def");
    assert.equal(bearerToken(req("Basic abc")), null);
    assert.equal(bearerToken(req()), null);
  });
});
