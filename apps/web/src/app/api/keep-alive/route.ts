import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Must run on every request, not once at build time.
export const dynamic = "force-dynamic";

/**
 * Hit daily by a Vercel cron (see vercel.json) so a free Supabase project isn't
 * paused for inactivity during judging. Reads a real table and returns nothing from it.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1 from classes limit 1`);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[keep-alive] database check failed", err);
    return Response.json({ ok: false }, { status: 503 });
  }
}
