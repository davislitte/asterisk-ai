import "server-only";
import type { AiProvider } from "./ai";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

/**
 * Where model calls are served, app-wide:
 * - "meta":     Muse Spark on the Meta Model API
 * - "district": Muse Spark Open, the open-weight model, on infrastructure the
 *               district controls (Baseten here), so student data stays there.
 * In a real district deployment whoever hosts Asterisk fixes this; the dashboard
 * switch shows the same app running on either model.
 */
export type AiHost = "meta" | "district";

const KEY = "ai_host";
const CACHE_MS = 5_000;

let cache: { host: AiHost | null; at: number } | null = null;

export function districtHostConfigured(): boolean {
  return Boolean(process.env.BASETEN_API_KEY?.trim());
}

/** The saved choice, or null if none was saved (then AI_PROVIDER decides). */
export async function getAiHost(): Promise<AiHost | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.host;
  try {
    const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
    const host = row?.value === "district" || row?.value === "meta" ? row.value : null;
    cache = { host, at: Date.now() };
    return host;
  } catch (err) {
    // Keep the last known choice if the lookup fails (or the table isn't migrated yet),
    // and don't retry (or log) again until the cache expires.
    console.warn("[ai-host] couldn't read the setting", err instanceof Error ? err.message.split("\n")[0] : err);
    cache = { host: cache?.host ?? null, at: Date.now() };
    return cache.host;
  }
}

export async function setAiHost(host: AiHost): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: KEY, value: host })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: host, updatedAt: new Date() } });
  cache = { host, at: Date.now() };
}

/** Installed as the AI layer's provider resolver. FAKE and MODAL from AI_PROVIDER are left alone. */
export async function resolveAiProvider(): Promise<AiProvider | undefined> {
  const env = process.env.AI_PROVIDER?.trim() || "META_API";
  if (env === "FAKE" || env === "MODAL") return undefined;
  const host = await getAiHost();
  if (host === "district") return "BASETEN";
  if (host === "meta") return "META_API";
  return undefined;
}

/** What calls actually use right now: the saved choice, else what AI_PROVIDER implies. */
export async function effectiveAiHost(): Promise<AiHost> {
  return (await getAiHost()) ?? (process.env.AI_PROVIDER?.trim() === "BASETEN" ? "district" : "meta");
}

export const AI_HOST_LABELS: Record<AiHost, { model: string; where: string }> = {
  meta: { model: "Muse Spark", where: "Meta Model API" },
  district: { model: "Muse Spark Open", where: "District-hosted (Baseten)" },
};
