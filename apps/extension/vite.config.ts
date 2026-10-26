import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest, { REPO_ROOT, apiOrigin } from "./manifest.config.ts";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  // Share the repo-root .env files; Vite only exposes VITE_-prefixed vars to the bundle.
  envDir: REPO_ROOT,
  server: {
    port: 5173,
    strictPort: true,
    // Dev preview (the panel opened as a normal page) calls the API same-origin through this proxy.
    proxy: { "/api": apiOrigin(mode) },
  },
}));
