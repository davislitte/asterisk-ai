import path from "node:path";
import { defineManifest } from "@crxjs/vite-plugin";
import { loadEnv } from "vite";
import pkg from "./package.json" with { type: "json" };

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Where the dashboard/API lives. Only VITE_-prefixed vars are read from the root .env files. */
export function apiOrigin(mode: string): string {
  const env = loadEnv(mode, REPO_ROOT, "VITE_");
  return new URL(env.VITE_API_BASE_URL || "http://localhost:3000").origin;
}

export default defineManifest(({ mode }) => ({
  manifest_version: 3,
  name: "Asterisk AI",
  description: "Your teacher's AI study helper. Works only where your teacher allows it.",
  version: pkg.version,
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  action: {
    default_title: "Open Asterisk",
    default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
  },
  side_panel: { default_path: "src/sidepanel/index.html" },
  background: { service_worker: "src/background.ts", type: "module" },
  // `tabs` lets the panel read the active tab's URL to enforce the teacher's allowlist.
  // `scripting` + the Docs host permission let it read the student's Google Doc when they click "Read my doc".
  permissions: ["sidePanel", "storage", "tabs", "scripting"],
  // The Asterisk API (no CORS needed) and Google Docs (read on click only).
  host_permissions: [`${apiOrigin(mode)}/*`, "https://docs.google.com/document/*"],
}));
