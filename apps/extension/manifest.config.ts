import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "Asterisk AI",
  description: "Your teacher's AI study helper. Works only where your teacher allows it.",
  version: pkg.version,
  action: { default_title: "Open Asterisk" },
  side_panel: { default_path: "src/sidepanel/index.html" },
  background: { service_worker: "src/background.ts", type: "module" },
  permissions: ["sidePanel", "storage"],
});
