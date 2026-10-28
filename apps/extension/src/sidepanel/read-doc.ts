import { MAX_DRAFT_CHARS } from "@asterisk/shared";
import { isExtension } from "./platform";

export interface Draft {
  text: string;
  title: string;
  source: "google_doc" | "pasted";
}

export type ReadDocResult = { ok: true; draft: Draft } | { ok: false; error: string };

/**
 * Runs inside the Google Doc tab (same origin, the student's own session), so
 * no Google credentials ever pass through Asterisk. Must be self-contained:
 * chrome.scripting serializes it.
 */
async function readDocInPage(): Promise<{ ok: true; text: string; title: string } | { ok: false; error: string }> {
  const match = /^\/document\/d\/([^/]+)/.exec(location.pathname);
  if (!match) return { ok: false, error: "not-a-doc" };
  const title = document.title.replace(/\s*-\s*Google Docs\s*$/, "").trim() || "Google Doc";
  const base = `/document/d/${match[1]}`;
  try {
    const res = await fetch(`${base}/export?format=txt`, { credentials: "include" });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/plain")) {
      return { ok: true, text: (await res.text()).replace(/^﻿/, ""), title };
    }
  } catch {
    // fall through to the simple HTML view
  }
  try {
    const res = await fetch(`${base}/mobilebasic`, { credentials: "include" });
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const root = doc.querySelector(".doc-content") ?? doc.body;
      const blocks = [...root.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, td")].map((e) => e.textContent ?? "");
      return { ok: true, text: blocks.join("\n"), title };
    }
  } catch {
    // fall through
  }
  return { ok: false, error: "fetch-failed" };
}

const DEV_PREVIEW_DRAFT =
  "[DEV PREVIEW: simulated Google Doc]\n1. x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2\n\n2. x^2 + 2x - 15 = 0\nx = 3";

/** S4: read the active Google Doc tab, only when the student asks. */
export async function readActiveGoogleDoc(): Promise<ReadDocResult> {
  if (!isExtension) {
    return { ok: true, draft: { text: DEV_PREVIEW_DRAFT, title: "Simulated doc", source: "google_doc" } };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://docs.google.com/document/d/")) {
    return { ok: false, error: "Open your Google Doc in this tab first, or paste your work instead." };
  }
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readDocInPage });
    const result = injection?.result;
    if (!result || !result.ok) {
      return { ok: false, error: "Couldn't read that doc. Make sure it's yours and open, or paste your work instead." };
    }
    const text = result.text.trim();
    if (!text) return { ok: false, error: "Your doc looks empty." };
    if (text.length > MAX_DRAFT_CHARS) {
      return { ok: false, error: "Your doc is too long to check at once. Paste just the part you want feedback on." };
    }
    return { ok: true, draft: { text, title: result.title, source: "google_doc" } };
  } catch {
    return { ok: false, error: "Asterisk doesn't have access to this tab. Reload the doc and try again." };
  }
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
