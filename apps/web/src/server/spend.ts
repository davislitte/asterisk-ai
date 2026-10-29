import "server-only";
import { SpendCapReachedError, estimateUsd } from "@asterisk/ai";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Daily spending cap (DAILY_SPEND_CAP_USD, default $5) over every paid model
 * call the app makes, computed from model_call_logs for the current UTC day.
 * Cached for a few seconds per server instance and topped up locally after each
 * call, so the cap can overshoot by at most a few in-flight calls.
 */

const DEFAULT_CAP_USD = 5;

export const SPEND_CAP_TEACHER_MESSAGE =
  "Today's AI spending cap has been reached, so Asterisk is paused until tomorrow (UTC). Raise DAILY_SPEND_CAP_USD to allow more.";
const CACHE_MS = 10_000;

let cache: { day: string; usd: number; at: number } | null = null;

const utcDay = () => new Date().toISOString().slice(0, 10);

export function dailyCapUsd(): number {
  const raw = process.env.DAILY_SPEND_CAP_USD;
  const value = raw === undefined || raw.trim() === "" ? DEFAULT_CAP_USD : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CAP_USD;
}

export async function spentTodayUsd(): Promise<number> {
  const day = utcDay();
  if (cache && cache.day === day && Date.now() - cache.at < CACHE_MS) return cache.usd;
  const [row] = await db.execute<{ tin: number; tout: number }>(sql`
    select coalesce(sum(tokens_in), 0)::int as tin, coalesce(sum(tokens_out), 0)::int as tout
    from model_call_logs
    where provider <> 'FAKE' and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`);
  const usd = estimateUsd(Number(row?.tin ?? 0), Number(row?.tout ?? 0));
  cache = { day, usd, at: Date.now() };
  return usd;
}

/** Called by the logger after each paid call so the cached total stays current between refreshes. */
export function recordSpend(tokensIn: number | null, tokensOut: number | null): void {
  if (cache && cache.day === utcDay()) cache.usd += estimateUsd(tokensIn ?? 0, tokensOut ?? 0);
}

/** The spend guard: throws once today's spend reaches the cap. */
export async function enforceDailyCap(): Promise<void> {
  const cap = dailyCapUsd();
  const spent = await spentTodayUsd();
  if (spent >= cap) {
    throw new SpendCapReachedError(`Daily AI spending cap of $${cap.toFixed(2)} reached ($${spent.toFixed(2)} spent today)`);
  }
}
