import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// All workspaces share one .env.local at the repo root (not committed).
const rootEnvFile = path.resolve(process.cwd(), "..", "..", ".env.local");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
