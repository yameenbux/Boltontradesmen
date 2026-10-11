// Renders the "BV" brick monogram app icons into public/icons/ (committed; re-run only when the mark changes).
//   PW_CHROMIUM_PATH=/path/to/chrome node scripts/make-icons.mjs
// Uses the Playwright Chromium already in devDependencies (no image libraries) and Gloock from Google Fonts.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const BRICK = "#9C3A25";
const CREAM = "#FFF5E9";

// rounded: corner radius as a share of the size (0 = full bleed, for platforms that apply their own mask).
// glyph: letter size as a share of the size. Maskable icons keep the letters inside the central 80% safe zone.
const ICONS = [
  { file: "apple-touch-icon.png", size: 180, rounded: 0, glyph: 0.42 },
  { file: "icon-192.png", size: 192, rounded: 0.22, glyph: 0.42 },
  { file: "icon-512.png", size: 512, rounded: 0.22, glyph: 0.42 },
  { file: "icon-maskable-512.png", size: 512, rounded: 0, glyph: 0.32 },
];

function html({ size, rounded, glyph }) {
  // Mirrors the header .mono: brick tile, cream Gloock letters, a soft mortar line across the middle, inner shade at the foot.
  return `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gloock&display=block">
<style>
  html,body{margin:0;background:transparent}
  .tile{width:${size}px;height:${size}px;border-radius:${Math.round(size * rounded)}px;background:${BRICK};position:relative;overflow:hidden;
        display:grid;place-items:center;box-shadow:inset 0 -${Math.max(2, Math.round(size * 0.04))}px 0 rgba(0,0,0,.15)}
  .tile::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 46%,rgba(0,0,0,.14) 46% 54%,transparent 54%)}
  b{position:relative;z-index:1;font:400 ${Math.round(size * glyph)}px/1 "Gloock",serif;color:${CREAM};letter-spacing:-.01em;
    transform:translateY(${Math.round(size * 0.02)}px)}
</style></head><body><div class="tile"><b>BV</b></div></body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    await page.setContent(html(icon), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => document.fonts.check('16px "Gloock"'));
    if (!loaded) throw new Error("Gloock did not load; check network access to fonts.googleapis.com");
    await page.locator(".tile").screenshot({ path: join(OUT, icon.file), omitBackground: true });
    await page.close();
    console.log(`wrote public/icons/${icon.file} (${icon.size}px)`);
  }
} finally {
  await browser.close();
}
