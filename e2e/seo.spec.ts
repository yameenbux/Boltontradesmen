import { expect, test, type Page } from "@playwright/test";

// The E2E fixture providers' phone numbers are +447700900301..303: none of those digits may leak into SEO output.
const PHONE_DIGITS = /7700\s*900\s*30\d|\+44\s*7700/;
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

async function jsonLd(page: Page) {
  return page.locator('script[type="application/ld+json"]').allTextContents();
}

test("robots.txt allows the site, blocks private paths and names the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/User-Agent: \*/i);
  expect(body).toContain("Allow: /");
  for (const path of ["/admin", "/api/", "/platform/consent/"]) expect(body).toContain(`Disallow: ${path}`);
  expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
});

test("sitemap.xml lists public pages and live providers, nothing private, no phone numbers", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const body = await res.text();
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const path of [
    "/",
    "/platform",
    "/platform/c/plumber",
    "/platform/p/e2e-ace-plumbing",
    "/platform/p/e2e-fresh-pipes",
    "/platform/p/e2e-half-way",
    "/privacy",
    "/terms",
    "/how-ratings-work",
  ]) {
    expect(locs).toContain(`${ORIGIN}${path}`);
  }
  // Categories with nobody listed are left out.
  expect(locs).not.toContain(`${ORIGIN}/platform/c/electrician`);
  expect(locs.filter((l) => /\/admin|\/consent|\/api\//.test(l))).toEqual([]);
  expect(body).not.toMatch(PHONE_DIGITS);
});

test("home carries Organization and WebSite JSON-LD", async ({ page }) => {
  await page.goto("/");
  const [raw] = await jsonLd(page);
  const data = JSON.parse(raw);
  const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
  expect(types).toEqual(["Organization", "WebSite"]);
  expect(data["@graph"][0]).toMatchObject({ name: "Bolton Vouched", email: "support@ysbdesigns.uk" });
});

test("provider profile: title, description, canonical, OG and LocalBusiness JSON-LD without phone data", async ({ page }) => {
  await page.goto("/platform/p/e2e-ace-plumbing");
  await expect(page).toHaveTitle("Ace Plumbing — Plumber in Bolton | Bolton Vouched");
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toContain("BL1, BL3 and BL4");
  expect(description).not.toMatch(PHONE_DIGITS);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/platform/p/e2e-ace-plumbing`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${ORIGIN}/social.png`);

  const scripts = await jsonLd(page);
  expect(scripts).toHaveLength(1);
  expect(scripts[0]).not.toMatch(PHONE_DIGITS);
  const ld = JSON.parse(scripts[0]);
  expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "Ace Plumbing", url: `${ORIGIN}/platform/p/e2e-ace-plumbing` });
  for (const k of ["telephone", "address", "aggregateRating", "review"]) expect(ld).not.toHaveProperty(k);
});

test("category page has its own title, description and canonical", async ({ page }) => {
  await page.goto("/platform/c/plumber");
  await expect(page).toHaveTitle("Plumber in Bolton | Bolton Vouched");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /BL1 to BL7/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/platform/c/plumber`);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("admin and consent pages are noindex", async ({ page }) => {
  for (const path of ["/admin/login", "/platform/consent/not-a-real-token"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});
