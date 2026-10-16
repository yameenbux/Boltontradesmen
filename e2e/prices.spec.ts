import { expect, test } from "@playwright/test";

// Price guides. Fixture (supabase/tests/fixtures/e2e.sql): gardeners have 10 published reviews (paused listings, so
// nothing else on the site changes): 4 under £250, 4 at £250-£1,000, 1 at £1,000-£5,000 and 1 over £5,000, 7 of them
// on the quote, the first in September 2025. Roofers have 9 published and 1 removed, so 9 count: no guide.
// Other specs post reviews in other trades while this runs, so lists are checked for what's in them, not their length.
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

test("a trade with 10 counted reviews has a guide built from them", async ({ page }) => {
  expect((await page.goto("/platform/prices/gardener"))?.status()).toBe(200);
  await expect(page).toHaveTitle("How much does a gardener cost in Bolton? | Bolton Vouched");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How much does a gardener cost in Bolton?");
  await expect(page.getByTestId("guide-source")).toHaveText(
    "What Bolton residents told us they paid, from 10 reviews of gardener jobs since September 2025.",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/platform/prices/gardener`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^What Bolton residents paid, from 10 reviews of gardener jobs since September 2025\. 70% said the price matched the quote\./);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  // No structured data on a price page.
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);

  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Trades" })).toHaveAttribute("href", "/platform");
  await expect(crumbs.getByRole("link", { name: "Prices" })).toHaveAttribute("href", "/platform/prices");
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Gardener");

  const bands = page.getByTestId("price-band");
  await expect(bands).toHaveText([
    /^Under £250\s*40% \(4 of 10\)$/,
    /^£250–£1,000\s*40% \(4 of 10\)$/,
    /^£1,000–£5,000\s*10% \(1 of 10\)$/,
    /^Over £5,000\s*10% \(1 of 10\)$/,
  ]);
  // A tie shows both bands.
  await expect(page.getByTestId("guide-most-common")).toHaveText("Most common totals Under £250 and £250–£1,000");
  await expect(page.getByTestId("guide-on-price")).toHaveText("70% said the final price matched the quote");
  await expect(page.getByTestId("guide-note")).toHaveText(
    "Prices vary with the size of the job. These are totals for whole jobs, not hourly rates. Always get a quote.",
  );
  const body = (await page.locator("main").innerText()).toLowerCase();
  for (const word of ["average", "per hour", "national"]) expect(body).not.toContain(word);
  expect(body).not.toMatch(/7700/);

  await expect(page.getByRole("link", { name: "See gardeners in Bolton" })).toHaveAttribute("href", "/platform/c/gardener");
  await expect(page.getByRole("link", { name: /Not sure who to ask\? Ask Bolton/ })).toHaveAttribute("href", "/platform/ask/new?category=gardener");
});

test("a trade with 9 counted reviews has no guide and isn't in the sitemap", async ({ page, request }) => {
  expect((await page.goto("/platform/prices/roofer"))?.status()).toBe(404);
  expect((await page.goto("/platform/prices/no-such-trade"))?.status()).toBe(404);

  const res = await request.get("/sitemap.xml");
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toContain(`${ORIGIN}/platform/prices`);
  expect(locs).toContain(`${ORIGIN}/platform/prices/gardener`);
  expect(locs).not.toContain(`${ORIGIN}/platform/prices/roofer`);
});

test("the prices index lists only trades with a guide", async ({ page }) => {
  await page.goto("/platform/prices");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What locals paid");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  const list = page.getByTestId("price-guides");
  const gardener = list.getByRole("link", { name: /How much does a gardener cost in Bolton\?/ });
  await expect(gardener).toHaveAttribute("href", "/platform/prices/gardener");
  await expect(gardener).toContainText("from 10 reviews");
  await expect(list.locator('a[href="/platform/prices/roofer"]')).toHaveCount(0);
  await expect(page.getByText("More guides appear as more reviews come in.")).toBeVisible();
});

test("a trade page links to its guide only when there is one", async ({ page }) => {
  await page.goto("/platform/c/gardener");
  const link = page.getByTestId("price-guide-link");
  await expect(link).toHaveAttribute("href", "/platform/prices/gardener");
  await expect(link).toContainText("What locals paid");
  await link.click();
  await expect(page).toHaveURL(/\/platform\/prices\/gardener$/);

  await page.goto("/platform/c/roofer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roofer");
  await expect(page.getByTestId("price-guide-link")).toHaveCount(0);
});
