import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL. Add it to .env.local (see .env.example).");
}

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { asteriskSql?: postgres.Sql };

// `prepare: false` keeps us compatible with Supabase's transaction pooler.
const sqlClient = globalForDb.asteriskSql ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.asteriskSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export { sqlClient };
export type Db = typeof db;
