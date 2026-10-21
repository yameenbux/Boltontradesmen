import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// Share and embed. Fixture (supabase/tests/fixtures/e2e.sql): Pine Joinery is Top rated, Ace Plumbing has no badge
// (4 reviews), Shaw & Daughters Removals is linked by its trader below.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const PHONE_DIGITS = /7700\s*900\s*3\d\d|\+44\s*7700/;

test("without a share sheet, Share opens a menu with WhatsApp and Copy link", async ({ page }) => {
  // Desktop Chromium may or may not have navigator.share; take it away so the fallback always shows.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/p/e2e-ace-plumbing");
  const url = `${ORIGIN}/p/e2e-ace-plumbing`;

  const share = page.locator(".prof-head").getByRole("button", { name: "Share" });
  await expect(share).toHaveAttribute("aria-expanded", "false");
  await share.click();
  await expect(share).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("group", { name: "Share this page" });
  const whatsapp = await menu.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
  expect(whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(`Ace Plumbing on Bolton Vouched: ${url}`)}`);
  expect(whatsapp).toContain(encodeURIComponent(url));

  await menu.getByRole("button", { name: "Copy link" }).click();
  await expect(menu.getByRole("status")).toHaveText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // Escape closes it; the contact bar is untouched.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(share).toBeFocused();
  const contact = page.getByRole("region", { name: "Contact Ace Plumbing" });
  await expect(contact.getByRole("link", { name: "Call Alan" })).toBeVisible();
  await expect(contact.getByRole("link", { name: "WhatsApp" })).toBeVisible();
});

test("with a share sheet, Share hands it the title and link", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { shareCalls: unknown[] }).shareCalls = calls;
    Object.defineProperty(Navigator.prototype, "share", {
      value: async (data: unknown) => void calls.push(data),
      configurable: true,
    });
  });
  await page.goto("/p/e2e-pine-joinery");
  await page.locator(".prof-head").getByRole("button", { name: "Share" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shareCalls: unknown[] }).shareCalls))
    .toEqual([{ title: "Pine Joinery on Bolton Vouched", url: `${ORIGIN}/p/e2e-pine-joinery` }]);
  await expect(page.getByRole("group", { name: "Share this page" })).toHaveCount(0);
});

test("the profile's social image is its own, and ?utm_source=badge keeps the clean canonical", async ({ page, request }) => {
  await page.goto("/p/e2e-pine-joinery?utm_source=badge");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/p/e2e-pine-joinery`);
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(new RegExp(`^${ORIGIN}/p/e2e-pine-joinery/opengraph-image`));
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[name="twitter:image"]')).not.toHaveAttribute("content", /social\.png/);
  const html = await page.content();
  expect(html).not.toContain("/social.png");

  const img = await request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect(img.headers()["set-cookie"]).toBeUndefined();
  expect((await img.body()).subarray(1, 4).toString()).toBe("PNG");

  // Other pages keep the site-wide image.
  await page.goto("/c/joiner");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${ORIGIN}/social.png`);
});

test("/badge/<slug>.svg is a cacheable SVG with the name and the earned badge", async ({ request }) => {
  const top = await request.get("/badge/e2e-pine-joinery.svg");
  expect(top.status()).toBe(200);
  expect(top.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
  expect(top.headers()["cache-control"]).toMatch(/public/);
  expect(top.headers()["set-cookie"]).toBeUndefined();
  const svg = await top.text();
  expect(svg).toContain(">Pine Joinery</text>");
  expect(svg).toContain(">VOUCHED IN BOLTON</text>");
  expect(svg).toContain(">Top rated</text>");
  expect(svg).not.toMatch(PHONE_DIGITS);

  const plain = await (await request.get("/badge/e2e-ace-plumbing.svg")).text();
  expect(plain).toContain(">Ace Plumbing</text>");
  expect(plain).toContain(">Listed on Bolton Vouched</text>");
  expect(plain).not.toMatch(/Top rated|Highly rated/);

  const amp = await (await request.get("/badge/e2e-shaw-vans.svg")).text();
  expect(amp).toContain("Shaw &amp; Daughters Removals");

  const png = await request.get("/badge/e2e-pine-joinery.png");
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect((await png.body()).subarray(1, 4).toString()).toBe("PNG");
});

test("badges 404 for unknown slugs, other extensions and listings that aren't live", async ({ request }) => {
  sql(`insert into public.providers (id, slug, business_name, phone_e164, areas, status)
       values ('00000000-0000-0000-0000-00000000e2ff', 'e2e-hidden-badge', 'Hidden Removals', '+447700900399', '{}', 'invited')
       on conflict (id) do nothing`);
  for (const path of [
    "/badge/e2e-nobody-here.svg",
    "/badge/e2e-nobody-here.png",
    "/badge/e2e-hidden-badge.svg",
    "/badge/e2e-pine-joinery.gif",
    "/badge/e2e-pine-joinery",
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(res.headers()["content-type"], path).not.toMatch(/svg|png/);
  }
});

test("a linked trader copies their badge's embed code and shares their page; the admin sees the badge too", async ({
  page,
  browser,
}, testInfo) => {
  const slug = "e2e-shaw-vans";
  const embed =
    `<a href="${ORIGIN}/p/${slug}?utm_source=badge"><img src="${ORIGIN}/badge/${slug}.svg" ` +
    `alt="Shaw &amp; Daughters Removals — vouched in Bolton on Bolton Vouched" width="240" height="80"></a>`;

  await adminSignIn(page);
  await page.goto("/admin/providers/00000000-0000-0000-0000-00000000e216");
  const admin = page.getByRole("region", { name: "Website badge" });
  await expect(admin.getByRole("textbox", { name: "Embed code" })).toHaveValue(embed);
  await expect(admin.getByTestId("badge-preview")).toHaveJSProperty("naturalWidth", 240);

  const signIn = page.getByRole("region", { name: "Trader sign-in" });
  await signIn.getByRole("button", { name: "Trader sign-in link" }).click();
  const path = new URL(await signIn.getByRole("textbox", { name: "Trader sign-in link" }).inputValue()).pathname;

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const trader = await context.newPage();
  await signInWithEmail(trader, `shaw-trader@${E2E_EMAIL_DOMAIN}`, { first: "Sam", surname: "Shaw", next: path });
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/provider$/);

  const badge = trader.getByRole("region", { name: "Your website badge" });
  const preview = badge.getByTestId("badge-preview");
  await expect(preview).toHaveAttribute("src", `/badge/${slug}.svg`);
  await expect(preview).toHaveJSProperty("naturalWidth", 240);
  await expect(badge.getByRole("textbox", { name: "Embed code" })).toHaveValue(embed);
  await badge.getByRole("button", { name: "Copy embed code" }).click();
  await expect(badge.getByRole("status")).toHaveText("Embed code copied. Paste it into your website's HTML.");
  expect(await trader.evaluate(() => navigator.clipboard.readText())).toBe(embed);
  const png = badge.getByRole("link", { name: "Download badge (PNG)" });
  await expect(png).toHaveAttribute("href", `/badge/${slug}.png`);
  await expect(png).toHaveAttribute("download", `bolton-vouched-${slug}.png`);

  const share = trader.getByRole("region", { name: "Share your page" });
  const url = `${ORIGIN}/p/${slug}`;
  await expect(share.getByTestId("page-link")).toHaveText(url.replace(/^https?:\/\//, ""));
  await share.getByRole("button", { name: "Copy link" }).click();
  expect(await trader.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const whatsapp = await share.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(whatsapp!.split("?text=")[1])).toBe(`Shaw & Daughters Removals on Bolton Vouched: ${url}`);
  await expect(share.getByText("Print a review card")).toHaveCount(0);
});
