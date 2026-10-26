import { useEffect, useState } from "react";
import type { z } from "zod";

/**
 * Runs as the real side panel (chrome-extension://) or, for development, as a
 * plain page served by Vite ("dev preview"). In preview, storage falls back to
 * localStorage and the active tab URL is simulated, so the UI can be tested
 * without loading the extension.
 */
export const isExtension = typeof chrome !== "undefined" && location.protocol === "chrome-extension:";

/** In preview the Vite dev server proxies /api to the dashboard. */
export const API_BASE = isExtension ? import.meta.env.VITE_API_BASE_URL || "http://localhost:3000" : "";

export async function load<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  let raw: unknown;
  if (isExtension) {
    raw = (await chrome.storage.local.get(key))[key];
  } else {
    const text = localStorage.getItem(key);
    raw = text ? JSON.parse(text) : undefined;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function save(key: string, value: unknown): Promise<void> {
  if (isExtension) await chrome.storage.local.set({ [key]: value });
  else localStorage.setItem(key, JSON.stringify(value));
}

export async function remove(key: string): Promise<void> {
  if (isExtension) await chrome.storage.local.remove(key);
  else localStorage.removeItem(key);
}

const PREVIEW_URL_KEY = "asterisk.preview.tabUrl";
const DEFAULT_PREVIEW_URL = "https://docs.google.com/document/d/demo-doc/edit";

/** URL of the tab this panel sits beside; updates as the student switches tabs or navigates. */
export function useActiveTabUrl(): [string | null, (url: string) => void] {
  const [url, setUrl] = useState<string | null>(() =>
    isExtension ? null : (localStorage.getItem(PREVIEW_URL_KEY) ?? DEFAULT_PREVIEW_URL),
  );

  useEffect(() => {
    if (!isExtension) return;
    const refresh = () =>
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setUrl(tab?.url ?? null));
    const onUpdated = (_id: number, change: { url?: string }, tab: chrome.tabs.Tab) => {
      if (tab.active && change.url) refresh();
    };
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, []);

  const simulate = (next: string) => {
    localStorage.setItem(PREVIEW_URL_KEY, next);
    setUrl(next);
  };
  return [url, simulate];
}
