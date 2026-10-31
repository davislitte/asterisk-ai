import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// All workspaces share one .env.local at the repo root (not committed).
const rootEnvFile = path.resolve(process.cwd(), "..", "..", ".env.local");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

// Cache Components is off: every dashboard page is per-teacher, cookie-gated
// data, so the request-time rendering model is the simpler fit.
const nextConfig: NextConfig = {
  // Keeps the dev-mode badge out of screenshots and the demo recording.
  devIndicators: false,
  experimental: {
    serverActions: {
      // Source uploads (PDF/DOCX) go through Server Actions. Vercel caps
      // function request bodies at 4.5 MB, so stay under that.
      bodySizeLimit: "4mb",
    },
  },
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
