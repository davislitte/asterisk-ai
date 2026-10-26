import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesAllowlist } from "./allowlist";

describe("matchesAllowlist", () => {
  const docs = ["docs.google.com/document/*"];

  it("matches Google Docs under the default pattern", () => {
    assert.ok(matchesAllowlist("https://docs.google.com/document/d/abc123/edit?tab=t.0", docs));
  });

  it("rejects other Google products and other hosts", () => {
    assert.ok(!matchesAllowlist("https://docs.google.com/spreadsheets/d/abc/edit", docs));
    assert.ok(!matchesAllowlist("https://evil.com/docs.google.com/document/x", docs));
    assert.ok(!matchesAllowlist("https://docs.google.com.evil.com/document/x", docs));
  });

  it("rejects non-web schemes and junk", () => {
    assert.ok(!matchesAllowlist("chrome://extensions", ["*"]));
    assert.ok(!matchesAllowlist("not a url", docs));
  });

  it("treats a bare host as the whole site and supports subdomain wildcards", () => {
    assert.ok(matchesAllowlist("https://khanacademy.org/math/algebra", ["khanacademy.org"]));
    assert.ok(matchesAllowlist("https://lms.district.edu/course/42", ["*.district.edu/course/*"]));
    assert.ok(!matchesAllowlist("https://district.edu/course/42", ["*.district.edu/course/*"]));
  });

  it("is case-insensitive", () => {
    assert.ok(matchesAllowlist("https://Docs.Google.com/Document/d/x", docs));
  });
});
