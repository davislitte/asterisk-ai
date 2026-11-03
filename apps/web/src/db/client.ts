import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL. Add it to .env.local (see .env.example).");
}

// Reuse one pool across hot reloads in dev and across route bundles on a server instance.
const globalForDb = globalThis as unknown as { asteriskSql?: postgres.Sql };

// `prepare: false` keeps us compatible with Supabase's transaction pooler.
// `idle_timeout` drops idle sockets before a paused serverless instance can reuse a dead one.
const sqlClient = globalForDb.asteriskSql ?? postgres(connectionString, { prepare: false, idle_timeout: 20 });
globalForDb.asteriskSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export { sqlClient };
export type Db = typeof db;
