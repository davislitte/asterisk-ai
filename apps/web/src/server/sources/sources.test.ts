import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkSections } from "./chunk";
import { ExtractionError, extractHtml, extractPlainText } from "./extract";
import { googleDocExportUrl, isPublicAddress } from "./fetch-url";
import { importFile } from "./import";
import { makeDocx, makePdf } from "./test-fixtures";

describe("source extraction", () => {
  it("extracts PDF text page by page with page refs", async () => {
    const pdf = makePdf(["Standard form is ax^2 + bx + c = 0.", "Set each factor equal to zero."]);
    const src = await importFile("Unit 4 notes.pdf", "application/pdf", pdf);
    assert.equal(src.kind, "pdf");
    assert.equal(src.title, "Unit 4 notes");
    assert.deepEqual(
      src.sections.map((s) => s.ref),
      ["p. 1", "p. 2"],
    );
    assert.match(src.sections[1]!.text, /each factor equal to zero/);
  });

  it("extracts DOCX text into sections at headings", async () => {
    const docx = makeDocx([
      { heading: "Zero product property" },
      { text: "If ab = 0 then a = 0 or b = 0." },
      { heading: "Checking roots" },
      { text: "Substitute each root into the original equation." },
    ]);
    const src = await importFile("notes.docx", "", docx);
    assert.equal(src.kind, "docx");
    assert.deepEqual(
      src.sections.map((s) => s.ref),
      ["§ Zero product property", "§ Checking roots"],
    );
  });

  it("rejects unsupported and empty files with a friendly message", async () => {
    await assert.rejects(importFile("photo.png", "image/png", new Uint8Array([1])), ExtractionError);
    await assert.rejects(importFile("empty.pdf", "application/pdf", new Uint8Array()), /empty/);
    await assert.rejects(importFile("bad.pdf", "application/pdf", new Uint8Array([1, 2, 3])), ExtractionError);
  });

  it("splits HTML at headings and drops page chrome", () => {
    const sections = extractHtml(`
      <html><body>
        <nav>Home | About</nav>
        <main>
          <h1>Quadratics</h1><p>Intro text.</p>
          <h2>Factoring</h2><p>Find two numbers.</p><ul><li><p>Nested para in list</p></li></ul>
        </main>
        <script>alert(1)</script>
      </body></html>`);
    assert.deepEqual(sections, [
      { ref: "§ Quadratics", text: "Intro text." },
      { ref: "§ Factoring", text: "Find two numbers.\n\nNested para in list" },
    ]);
  });

  it("uses markdown headings in pasted text", () => {
    const sections = extractPlainText("Preamble\n# One\nalpha\n\n## Two\nbeta");
    assert.deepEqual(
      sections.map((s) => s.ref),
      ["Text", "§ One", "§ Two"],
    );
  });

  it("chunks long sections at paragraph boundaries with part refs", () => {
    const para = "x".repeat(900);
    const chunks = chunkSections([{ ref: "p. 3", text: `${para}\n\n${para}\n\n${para}` }], 1500);
    assert.deepEqual(
      chunks.map((c) => c.ref),
      ["p. 3 (part 1/3)", "p. 3 (part 2/3)", "p. 3 (part 3/3)"],
    );
    assert.ok(chunks.every((c) => c.text.length <= 1500));
  });
});

describe("URL import guards", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
    for (const ip of ["8.8.8.8", "142.250.80.46", "2606:4700:4700::1111"]) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
    assert.equal(isPublicAddress("not-an-ip"), false);
  });

  it("rewrites Google Docs links to the plain-text export", () => {
    assert.equal(
      googleDocExportUrl("https://docs.google.com/document/d/abc_123-x/edit?tab=t.0"),
      "https://docs.google.com/document/d/abc_123-x/export?format=txt",
    );
    assert.equal(googleDocExportUrl("https://example.com/doc"), null);
  });
});
