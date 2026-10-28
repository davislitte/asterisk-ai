/**
 * Renders icons/icon.svg to the PNG sizes Chrome wants (public/icons/icon-N.png).
 * Run after editing the SVG:  pnpm --filter @asterisk/extension icons
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const svg = await readFile(path.join(root, "icons", "icon.svg"), "utf8");
const browser = await chromium.launch({
  channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : "chromium"),
});
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: path.join(root, "public", "icons", `icon-${size}.png`), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
console.info("Rendered public/icons/icon-{16,32,48,128}.png");
