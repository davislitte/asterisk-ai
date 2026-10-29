import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Model calls must go through `@/server/ai`, which installs the call logger and
 * the daily spending cap. Importing `@asterisk/ai` directly would skip both.
 */
const ALLOWED = new Set(["server/ai.ts", "server/spend.ts", "server/student/session.ts"]);

describe("model call imports", () => {
  it("only @/server/ai (and its helpers) import @asterisk/ai directly", () => {
    const root = path.join(import.meta.dirname, "..");
    const offenders = listFiles(root)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"))
      .map((f) => path.relative(root, f).replaceAll("\\", "/"))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /from ["']@asterisk\/ai["']/.test(readFileSync(path.join(root, rel), "utf8")));
    assert.deepEqual(offenders, [], "import model functions from @/server/ai instead");
  });
});

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
