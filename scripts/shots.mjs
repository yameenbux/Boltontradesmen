// Screenshots of the live platform for the showcase site at "/", plus its social preview image.
//   PW_CHROMIUM_PATH=/path/to/chrome node scripts/shots.mjs            reset the LOCAL db, load fixtures, build, start, capture
//   PW_CHROMIUM_PATH=/path/to/chrome node scripts/shots.mjs --social   only re-render public/social.png from the saved shots
//   SHOTS_URL=http://localhost:3000 node scripts/shots.mjs             capture from a server you already started (no reset/build)
//
// Data: supabase/tests/fixtures/e2e.sql (via scripts/e2e-prepare.sh, which refuses non-local databases) plus the made-up
// sample listings in scripts/shots-demo.sql. No real people or numbers appear. Phones are 390x844 at 2x, light theme.
// Output: public/shots/*.webp (encoded by Chromium itself) and public/social.png (1200x630, re-encoded by sharp).
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandMarkSvg } from "../lib/brand-mark.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "shots");
const PORT = 3100;
const QUALITY = 0.8;
const INVITED_TOKEN = "00000000-0000-0000-0000-0000000dc0de"; // the invited listing in shots-demo.sql

// [file, path, prepare(page)]. Each prepare leaves the page where the picture should be taken.
const SHOTS = [
  ["home", "/platform", async () => {}],
  ["home-howto", "/platform", async (page) => scrollTo(page, ".howto", 160)],
  ["category", "/platform/c/plumber", async () => {}],
  ["category-area", "/platform/c/plumber", async (page) => {
    await page.getByRole("button", { name: "BL3", exact: true }).click();
    await page.waitForTimeout(150);
  }],
  ["profile", "/platform/p/demo-halliwell-plumbing", async () => {}],
  ["profile-checks", "/platform/p/demo-halliwell-plumbing", async (page) => scrollTo(page, "#checks-title, .checks", 220)],
  ["profile-reviews", "/platform/p/demo-halliwell-plumbing", async (page) => scrollTo(page, "#reviews-title", 90)],
  ["profile-contact", "/platform/p/demo-spark-right", async () => {}],
  ["ratings", "/how-ratings-work", async () => {}],
  ["consent", `/platform/consent/${INVITED_TOKEN}`, async () => {}],
];

async function scrollTo(page, selector, offset) {
  await page.locator(selector).first().evaluate((el, off) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off);
  }, offset);
  await page.waitForTimeout(150);
}

// next build keeps Supabase fetch responses in .next/cache/fetch-cache across builds. Clear it before building (so the
// pictures show the sample listings) and afterwards (so the next e2e build does not serve them).
const clearFetchCache = () => rmSync(join(ROOT, ".next", "cache", "fetch-cache"), { recursive: true, force: true });

function loadEnvDefaults() {
  // The real operator in the footer and on the consent page, then the local defaults from .env.example
  // (same as playwright.config.ts); variables already set win.
  process.env.OWNER_LEGAL_NAME ??= "YSB Ventures Ltd";
  process.env.CONTACT_EMAIL ??= "support@ysbdesigns.uk";
  for (const line of readFileSync(join(ROOT, ".env.example"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
}

async function startServer() {
  const url = `http://localhost:${PORT}`;
  if (await fetch(url).then(() => true, () => false)) throw new Error(`port ${PORT} is busy; stop that server first`);
  loadEnvDefaults();
  run("bash", ["scripts/e2e-prepare.sh"]);
  run("psql", [process.env.SUPABASE_DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", "scripts/shots-demo.sql"]);
  clearFetchCache();
  run("npm", ["run", "--silent", "build"]);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env: process.env, stdio: "ignore", detached: true });
  const kill = () => {
    try {
      process.kill(-server.pid);
    } catch {} // already gone
  };
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/platform`)).ok) {
        return { url, stop: () => (kill(), clearFetchCache()) };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  kill();
  throw new Error("next start did not come up");
}

async function encodeWebp(browser, png) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ({ b64, q }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        const out = c.toDataURL("image/webp", q);
        if (!out.startsWith("data:image/webp")) throw new Error("this Chromium cannot encode webp");
        return out.split(",")[1];
      },
      { b64: png.toString("base64"), q: QUALITY },
    );
  } finally {
    await page.close();
  }
}

async function captureShots(browser, url) {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce", // final state of every animation, real numbers in the count-ups
    isMobile: true,
    hasTouch: true,
  });
  let total = 0;
  for (const [file, path, prepare] of SHOTS) {
    const page = await context.newPage();
    // "load", not "networkidle": the platform keeps prefetching links, so the network never goes quiet.
    const res = await page.goto(url + path, { waitUntil: "load" });
    if (!res?.ok()) throw new Error(`${path} answered ${res?.status()}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await prepare(page);
    const png = await page.screenshot({ type: "png" });
    const webp = Buffer.from(await encodeWebp(browser, png), "base64");
    writeFileSync(join(OUT, `${file}.webp`), webp);
    total += webp.length;
    console.log(`wrote public/shots/${file}.webp (${Math.round(webp.length / 1024)} KB)`);
    await page.close();
  }
  await context.close();
  console.log(`shots total ${Math.round(total / 1024)} KB`);
}

function dataUrl(file) {
  return `data:image/webp;base64,${readFileSync(join(OUT, file)).toString("base64")}`;
}

// The link preview (WhatsApp, iMessage, Facebook): the showcase hero in miniature.
async function renderSocial(browser) {
  const phone = (file, cls) => `<div class="phone ${cls}"><img src="${dataUrl(file)}" alt=""></div>`;
  const html = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gloock&family=Figtree:wght@500;700&display=block">
<style>
  *{box-sizing:border-box} html,body{margin:0}
  body{width:1200px;height:630px;overflow:hidden;position:relative;font-family:Figtree,sans-serif;color:#FFF5E9;
    background:radial-gradient(60% 80% at 8% 0%,rgba(217,112,79,.42),transparent 60%),radial-gradient(50% 70% at 100% 100%,rgba(215,169,76,.20),transparent 60%),#150F0C}
  body::before{content:"";position:absolute;inset:0;background:radial-gradient(rgba(255,245,233,.10) 1.2px,transparent 1.4px) 0 0/24px 24px}
  .copy{position:absolute;left:68px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:22px}
  .brand{display:flex;align-items:center;gap:14px;font:400 30px/1 Gloock,serif}
  .mono{width:54px;height:54px;border-radius:15px;background:#9C3A25;display:grid;place-items:center;position:relative;overflow:hidden}
  .mono svg{position:relative;z-index:1;display:block}
  .mono::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 46%,rgba(0,0,0,.14) 46% 54%,transparent 54%)}
  h1{margin:0;font:400 60px/1.03 Gloock,serif;letter-spacing:-.015em}
  h1 span{display:block;background:linear-gradient(90deg,#E07A55,#D7A94C);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{margin:0;font-size:25px;line-height:1.4;color:#D9C7B6;max-width:30ch}
  .meta{font-size:19px;font-weight:700;color:#D7A94C;letter-spacing:.02em}
  .phone{position:absolute;width:236px;aspect-ratio:390/844;border-radius:38px;padding:9px;background:#0B0806;
    box-shadow:0 0 0 1.5px rgba(255,245,233,.16),0 40px 80px -20px rgba(0,0,0,.8)}
  .phone img{width:100%;height:100%;object-fit:cover;border-radius:30px;display:block}
  .tag{position:absolute;right:28px;bottom:22px;z-index:5;padding:7px 14px;border-radius:999px;background:rgba(21,15,12,.88);
    border:1px solid rgba(255,245,233,.22);font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#FFF5E9}
  .a{left:672px;top:128px;transform:rotate(-8deg)} .c{left:908px;top:128px;transform:rotate(8deg)} .b{left:790px;top:64px;z-index:2}
</style></head><body>
  <div class="copy">
    <div class="brand"><div class="mono">${brandMarkSvg("#FFF5E9", 36)}</div>Bolton Vouched</div>
    <h1>Anyone know a good…?<span>Bolton already does.</span></h1>
    <p>The local trades and services the group recommends, all in one place.</p>
    <div class="meta">Free · No sign-up to look · Made in Bolton</div>
  </div>
  ${phone("category.webp", "a")}${phone("profile.webp", "c")}${phone("home.webp", "b")}
  <div class="tag">Sample listings shown</div>
</body></html>`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (!(await page.evaluate(() => document.fonts.check('16px "Gloock"')))) {
    throw new Error("Gloock did not load; check network access to fonts.googleapis.com");
  }
  // Chromium's full-colour PNG is about 360 KB; a dithered 256-colour PNG at top quality looks the same and is about
  // 110 KB, so WhatsApp and friends fetch the preview fast (a lossless re-encode only reaches about 340 KB).
  const png = await page.screenshot({ type: "png" });
  await sharp(png)
    .png({ palette: true, quality: 100, effort: 10, compressionLevel: 9 })
    .toFile(join(ROOT, "public", "social.png"));
  await page.close();
  console.log(`wrote public/social.png (${Math.round(statSync(join(ROOT, "public", "social.png")).size / 1024)} KB)`);
}

const socialOnly = process.argv.includes("--social");
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
let server;
try {
  if (!socialOnly) {
    server = process.env.SHOTS_URL ? { url: process.env.SHOTS_URL, stop() {} } : await startServer();
    await captureShots(browser, server.url);
  }
  await renderSocial(browser);
} finally {
  await browser.close();
  server?.stop();
}
