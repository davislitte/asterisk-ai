import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const rootEnvFile = path.resolve(process.cwd(), "..", "..", ".env.local");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

// Migrations need a session connection (Supabase session pooler, port 5432),
// not the transaction pooler. Falls back to DATABASE_URL. `generate` needs neither.
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
