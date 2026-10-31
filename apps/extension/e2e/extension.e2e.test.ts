/**
 * End-to-end test of the BUILT extension (apps/extension/dist) in Playwright's
 * Chromium. Needs the dashboard running on VITE_API_BASE_URL (default
 * http://localhost:3000) with the seed loaded (join code QUAD24).
 * Works with any AI_PROVIDER: on FAKE it's free; on META_API it's a real
 * end-to-end run on Muse Spark (about 15 calls, roughly $0.10).
 *
 *   pnpm --filter @asterisk/extension build && pnpm --filter @asterisk/extension test:e2e
 *
 * The panel page is opened inside the extension (real chrome.storage,
 * chrome.tabs and host_permissions). Google is never contacted: docs.google.com
 * and www.google.com are answered by Playwright route mocks. The test deletes
 * the student and log rows it created.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { type BrowserContext, type Page, chromium } from "playwright";
import postgres from "postgres";

const DIST = path.resolve(import.meta.dirname, "..", "dist");
const STUDENT = `E2E Test ${Date.now().toString(36)}`;
const DOC_URL = "https://docs.google.com/document/d/e2e-doc/edit";
const DOC_TEXT = "1. x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2";
/** Handwriting-style worksheet rendered for this project (problems 1–3; problem 2 misses a root). */
const PHOTO = path.resolve(import.meta.dirname, "fixtures", "worksheet.jpg");
/** Real Muse Spark turns take 7–10 s (rubric check ~30 s); FAKE is instant. */
const MODEL_TIMEOUT = 90_000;

let context: BrowserContext;
let panel: Page;
let userDataDir: string;
let startedAt: Date;
const studentApiBodies: string[] = [];

describe("built extension", { timeout: 600_000 }, () => {
  before(async () => {
    startedAt = new Date();
    userDataDir = await mkdtemp(path.join(os.tmpdir(), "asterisk-e2e-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      // Installed Edge on Windows (Playwright's bundled Chromium fails to start on some
      // Windows builds with a side-by-side assembly error); bundled Chromium elsewhere.
      // Branded Chrome ignores --load-extension, so it can't be used here.
      channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : "chromium"),
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    const fakePage = (title: string) => ({ contentType: "text/html", body: `<title>${title}</title><p>${title}</p>` });
    await context.route("https://docs.google.com/**", (route) =>
      route.fulfill(
        route.request().url().includes("/export?format=txt")
          ? { contentType: "text/plain; charset=utf-8", body: `﻿${DOC_TEXT}` }
          : fakePage("Algebra HW - Google Docs"),
      ),
    );
    await context.route("https://www.google.com/**", (route) => route.fulfill(fakePage("Search")));
  });

  after(async () => {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
    await deleteTestData();
  });

  it("registers a service worker that opens the side panel from the toolbar icon", async () => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const behavior = await worker.evaluate(() => chrome.sidePanel.getPanelBehavior());
    assert.equal(behavior.openPanelOnActionClick, true);

    const extensionId = new URL(worker.url()).host;
    panel = await context.newPage();
    panel.on("response", async (res) => {
      if (res.url().includes("/api/student/")) studentApiBodies.push(await res.text().catch(() => ""));
    });
    await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  });

  it("joins the class and lists assignments", async () => {
    await panel.getByPlaceholder("ABC123").fill("QUAD24");
    await panel.getByPlaceholder("First name or nickname").fill(STUDENT);
    await panel.getByRole("button", { name: "Join class" }).click();
    await panel.getByText("Which assignment are you working on?").waitFor();

    const stored = await panel.evaluate(() => chrome.storage.local.get("asterisk.session"));
    assert.ok((stored["asterisk.session"] as { token?: string } | undefined)?.token, "session saved in chrome.storage");
  });

  it("stays off when the active tab isn't allowlisted", async () => {
    await panel.getByRole("button", { name: /Solving Quadratics by Factoring/ }).click();
    // The active tab is the panel page itself (chrome-extension://), which isn't allowed.
    await panel.getByText("Asterisk isn't enabled here by your teacher.").waitFor();
  });

  it("turns on when a Google Doc becomes the active tab, and chats with citations", async () => {
    // Open the doc from the panel so it lands in the same window, then make it active.
    const docPagePromise = context.waitForEvent("page");
    await panel.evaluate((url) => chrome.tabs.create({ url, active: true }), DOC_URL);
    await (await docPagePromise).waitForLoadState();

    const box = panel.getByLabel("Message Asterisk");
    await box.waitFor();
    await box.fill("Can you just tell me both roots for problem 1?");
    await box.press("Enter");

    await panel.locator("[data-role=assistant]").first().waitFor({ timeout: MODEL_TIMEOUT });
    const sources = panel.getByRole("list", { name: "Sources" }).first();
    await sources.waitFor();
    assert.match(await sources.innerText(), /Unit 4 Notes/);
  });

  it("reads the Google Doc on click and sends it as chat context", async () => {
    await panel.getByRole("button", { name: "📄 Share my doc" }).click();
    // Every tab stays mounted (hidden when inactive); the role query only sees the visible one.
    await panel.getByRole("tabpanel").getByText(/Using “Algebra HW” · 18 words/).waitFor();

    const request = panel.waitForRequest((r) => r.url().endsWith("/chat") && r.method() === "POST");
    const box = panel.getByLabel("Message Asterisk");
    await box.fill("Can you look at my problem 1?");
    await box.press("Enter");
    const body = (await request).postDataJSON() as { message: string; draft?: string };
    assert.equal(body.draft, DOC_TEXT, "draft sent without the BOM");
    await panel.locator("[data-role=assistant]").nth(1).waitFor({ timeout: MODEL_TIMEOUT });
  });

  it("checks the draft against the rubric without rewriting it", async () => {
    await panel.getByRole("tab", { name: "Check my work" }).click();
    await panel.getByRole("button", { name: "Check against the rubric" }).click();
    const feedback = panel.getByRole("region", { name: "Rubric feedback" });
    await feedback.waitFor({ timeout: MODEL_TIMEOUT });
    const text = await feedback.innerText();
    assert.match(text, /\d+ \/ 12 points · practice only/);
    for (const criterion of ["Factoring", "Finds all roots", "Checks and interprets", "Explains reasoning"]) {
      assert.match(text, new RegExp(criterion));
    }
    await panel.getByRole("tab", { name: "Ask" }).click();
  });

  it("gives per-problem feedback on a photo of handwritten work", async () => {
    await panel.getByRole("tab", { name: "Photo" }).click();
    const request = panel.waitForRequest((r) => r.url().endsWith("/photo") && r.method() === "POST");
    await panel.locator("#photo-input").setInputFiles(PHOTO);
    const body = (await request).postDataJSON() as { image: string };
    assert.match(body.image, /^data:image\/jpeg;base64,/, "downscaled to JPEG in the panel");
    const feedback = panel.getByRole("region", { name: "Photo feedback" });
    await feedback.waitFor({ timeout: MODEL_TIMEOUT });
    // On Muse Spark the fixture's three problems are read; the FAKE stub reads nothing.
    if (process.env.AI_PROVIDER !== "FAKE") assert.match(await feedback.innerText(), /Problem 2/);
    await panel.getByRole("tab", { name: "Ask" }).click();
  });

  it("answers the comprehension questions in writing and marks the assignment complete", async () => {
    await panel.getByRole("tab", { name: "Finish" }).click();
    const answers = panel.getByRole("tabpanel").locator("form textarea");
    await answers.first().waitFor();
    assert.equal(await answers.count(), 3, "the seed's 3 approved questions");
    for (let i = 0; i < 3; i++) {
      await answers.nth(i).fill("Because a product is zero only when one of its factors is zero, so each factor gives a root to check.");
    }
    await panel.getByRole("button", { name: "Submit answers & mark complete" }).click();
    await panel.getByText("Assignment complete").waitFor({ timeout: MODEL_TIMEOUT });
    // Grades are for the teacher only.
    assert.ok(
      !studentApiBodies.some((b) => /"(understanding|rationale|score|misconception)"\s*:/.test(b)),
      "no grade fields sent to the student",
    );
    await panel.getByRole("tab", { name: "Ask" }).click();
  });

  it("turns off again when the doc tab navigates elsewhere", async () => {
    const doc = context.pages().find((p) => p.url().startsWith("https://docs.google.com/"));
    assert.ok(doc, "doc tab open");
    await doc.goto("https://www.google.com/search?q=answers");
    await panel.getByText("Asterisk isn't enabled here by your teacher.").waitFor();
  });

  it("never received an answer key", () => {
    assert.ok(studentApiBodies.length >= 3, "captured student API responses");
    for (const body of studentApiBodies) {
      assert.ok(!body.includes("answerKey"), "no answerKey field");
      assert.ok(!body.includes("x = 2 or x = 3"), "no seeded answer text");
    }
  });
});

/**
 * Removes only what this run created: its student (cascades to chats, rubric
 * checks, answers and the submission) and FAKE call logs since start. Real
 * (META_API) call logs are kept as a usage record.
 */
async function deleteTestData() {
  if (!process.env.DATABASE_URL) {
    console.warn(`DATABASE_URL not set; remove student "${STUDENT}" by hand.`);
    return;
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  try {
    await sql`delete from students where display_name = ${STUDENT}`;
    // Every FAKE call this run made: tutor.reply, guard.classify, guard.leak_check.
    await sql`delete from model_call_logs where provider = 'FAKE' and created_at >= ${startedAt}`;
  } finally {
    await sql.end();
  }
}
