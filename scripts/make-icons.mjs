// Renders the brick tile with the house-and-tick mark into the app icons (committed; re-run only when the mark changes):
//   public/icons/*.png (PWA and Apple touch icons) and app/favicon.ico (16, 32 and 48px, PNG-in-ICO).
//   PW_CHROMIUM_PATH=/path/to/chrome node scripts/make-icons.mjs
// Uses the Playwright Chromium already in devDependencies (no image libraries). The mark itself comes from
// lib/brand-mark.ts (imported directly; Node strips the types), so the icons always match the header.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandMarkSvg } from "../lib/brand-mark.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "icons");
const BRICK = "#9C3A25";
const CREAM = "#FFF5E9";

// rounded: corner radius as a share of the size (0 = full bleed, for platforms that apply their own mask).
// mark: the mark's size as a share of the tile. Maskable icons keep the mark well inside the central 80% safe zone
// (a circle mask of diameter 0.8 x size still clears the corners of a 0.5 x size mark).
const ICONS = [
  { file: "apple-touch-icon.png", size: 180, rounded: 0, mark: 0.66 },
  { file: "icon-192.png", size: 192, rounded: 0.22, mark: 0.66 },
  { file: "icon-512.png", size: 512, rounded: 0.22, mark: 0.66 },
  { file: "icon-maskable-512.png", size: 512, rounded: 0, mark: 0.5 },
];
// Favicon sizes: a larger mark, and no mortar line or shade at 16/32px, so it stays crisp in a browser tab.
const FAVICON_SIZES = [16, 32, 48];

function html({ size, rounded, mark, plain = false }) {
  // Mirrors the header .mono: brick tile, cream line mark, a soft mortar line across the middle, inner shade at the foot.
  return `<!doctype html><html><head><style>
  html,body{margin:0;background:transparent}
  .tile{width:${size}px;height:${size}px;border-radius:${Math.round(size * rounded)}px;background:${BRICK};position:relative;overflow:hidden;
        display:grid;place-items:center;box-shadow:inset 0 -${Math.max(1, Math.round(size * 0.04))}px 0 rgba(0,0,0,.15)}
  .tile::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 46%,rgba(0,0,0,.14) 46% 54%,transparent 54%)}
  .tile svg{position:relative;z-index:1;display:block}
  ${plain ? ".tile{box-shadow:none}.tile::after{display:none}" : ""}
</style></head><body><div class="tile">${brandMarkSvg(CREAM, Math.round(size * mark))}</div></body></html>`;
}

// ICO container holding PNG images (supported by every current browser and Windows Vista onwards).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function render(browser, spec) {
  const page = await browser.newPage({ viewport: { width: spec.size, height: spec.size }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html(spec));
    return await page.locator(".tile").screenshot({ omitBackground: true });
  } finally {
    await page.close();
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
try {
  for (const icon of ICONS) {
    writeFileSync(join(OUT, icon.file), await render(browser, icon));
    console.log(`wrote public/icons/${icon.file} (${icon.size}px)`);
  }
  const pngs = [];
  for (const size of FAVICON_SIZES) {
    pngs.push({ size, data: await render(browser, { size, rounded: 0.22, mark: size <= 32 ? 0.84 : 0.74, plain: size <= 32 }) });
  }
  writeFileSync(join(ROOT, "app", "favicon.ico"), ico(pngs));
  console.log(`wrote app/favicon.ico (${FAVICON_SIZES.join(", ")}px)`);
} finally {
  await browser.close();
}
