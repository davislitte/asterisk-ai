import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { decodeSessionToken, encodeSessionToken, guestSessionSecret } from "./session-token";

const SECRET = "x".repeat(32);
const ID = "3f6c1d2e-9a4b-4c5d-8e7f-0a1b2c3d4e5f";
const DASHBOARD = path.join(import.meta.dirname, "..", "app", "(dashboard)");

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

describe("guest access", () => {
  it("a guest token can't be replayed as a teacher token, or the reverse", () => {
    const expires = Date.now() + 60_000;
    const guest = encodeSessionToken(ID, expires, guestSessionSecret(SECRET));
    assert.equal(decodeSessionToken(guest, SECRET), null);
    assert.equal(decodeSessionToken(guest, guestSessionSecret(SECRET)), ID);

    const teacher = encodeSessionToken(ID, expires, SECRET);
    assert.equal(decodeSessionToken(teacher, guestSessionSecret(SECRET)), null);
  });

  it("every teacher server action refuses guests", () => {
    const actions = listFiles(DASHBOARD).filter((f) => path.basename(f) === "actions.ts");
    assert.ok(actions.length >= 6, "expected to find the dashboard's action files");
    for (const file of actions) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(DASHBOARD, file);
      assert.ok(src.includes("requireTeacher("), `${rel}: actions must call requireTeacher()`);
      assert.ok(!src.includes("requireViewer"), `${rel}: requireViewer() lets guests in; actions must use requireTeacher()`);
    }
  });

  it("the page guests can open doesn't send them answer keys", () => {
    const src = readFileSync(path.join(DASHBOARD, "assignments", "[assignmentId]", "page.tsx"), "utf8");
    assert.match(src, /teacher\.guest \? a\.problems\.map\(\(\{ prompt \}\) => \(\{ prompt \}\)\)/);
  });
});
