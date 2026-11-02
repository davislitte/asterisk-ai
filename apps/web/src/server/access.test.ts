import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkStudentAccess, usableTeacherPasscode } from "./access";

const KEY = "k".repeat(24);

describe("student access key", () => {
  it("is open locally when no key is set", () => {
    assert.equal(checkStudentAccess(undefined, { NODE_ENV: "development" }), "open");
  });

  it("is closed in production until a long enough key is set", () => {
    assert.equal(checkStudentAccess(KEY, { NODE_ENV: "production" }), "closed");
    assert.equal(checkStudentAccess("short", { NODE_ENV: "production", STUDENT_ACCESS_KEY: "short" }), "closed");
  });

  it("requires the key once it is set", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const env = { NODE_ENV, STUDENT_ACCESS_KEY: KEY };
      assert.equal(checkStudentAccess(undefined, env), "missing");
      assert.equal(checkStudentAccess("", env), "missing");
      assert.equal(checkStudentAccess(`${KEY}x`, env), "wrong");
      assert.equal(checkStudentAccess(KEY, env), "ok");
    }
  });
});

describe("teacher passcode", () => {
  it("rejects a missing passcode, and a short one in production only", () => {
    assert.equal(usableTeacherPasscode({ NODE_ENV: "development" }), null);
    assert.equal(usableTeacherPasscode({ NODE_ENV: "development", TEACHER_PASSCODE: "abc" }), "abc");
    assert.equal(usableTeacherPasscode({ NODE_ENV: "production", TEACHER_PASSCODE: "abc" }), null);
    assert.equal(usableTeacherPasscode({ NODE_ENV: "production", TEACHER_PASSCODE: KEY }), KEY);
  });
});
