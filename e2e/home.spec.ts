import { expect, test } from "@playwright/test";

// Fixture (supabase/tests/fixtures/e2e.sql): three live plumbers, four live joiners, plus one live electrician and
// fifteen man & van (review targets for the sign-in and review card specs, and the availability, share, trader
// dashboard, Pro and community questions specs). Every other category is empty.

test("hero shows the headline and the search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trades your neighbours vouch for.");
  await expect(page.getByRole("searchbox", { name: "What do you need?" })).toBeVisible();
});

test("popular shortcuts put trades with pros first, top up with everyday trades, then All trades", async ({ page }) => {
  await page.goto("/");
  const grid = page.getByTestId("shortcuts");
  const links = grid.getByRole("link");
  await expect(links).toHaveCount(8);
  // Fixture: man & van (15), joiners (4), plumbers (3 or 4), one electrician; then staples with nobody yet.
  await expect(links.nth(0)).toHaveAttribute("href", "/c/man-and-van");
  await expect(grid.getByRole("link", { name: "Plumber" })).toHaveAttribute("href", "/c/plumber");
  await expect(grid.getByRole("link", { name: "Gas & boilers" })).toHaveAttribute("href", "/c/gas-boilers");
  const all = links.last();
  await expect(all).toHaveAttribute("href", "/trades");
  await expect(all).toHaveText(/^\d+\s*All trades$/);
  // No zero counts anywhere on the home page.
  await expect(page.getByText(/\b0 with pros|0 local pros/)).toHaveCount(0);
});

test("new on Bolton Vouched shows the newest listings, linking to their pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New on Bolton Vouched" })).toBeVisible();
  const cards = page.getByTestId("new-traders").getByRole("link");
  await expect(cards).toHaveCount(8);
  await expect(cards.first()).toHaveAttribute("href", /^\/p\//);
  await expect(cards.first()).toContainText(/be the first to review|\d+ reviews?/);
});

test("all trades lists every group, links every trade and counts only the ones with pros", async ({ page }) => {
  await page.goto("/trades");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("All trades");
  for (const name of ["Home & trades", "Moving & waste", "Weddings & events", "Vehicles"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /^Plumber [34]$/ })).toHaveAttribute("href", "/c/plumber");
  await expect(page.getByRole("link", { name: "Tiler", exact: true })).toHaveAttribute("href", "/c/tiler");
  await expect(page.getByText(/with pros|soon/)).toHaveCount(0);
});

test("searching a partial trade goes to its category page", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("searchbox", { name: "What do you need?" });
  await box.fill("  Plumb ");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/c\/plumber$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the Find button submits too, and empty categories still navigate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "What do you need?" }).fill("bouncy");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/\/c\/bouncy-castles$/);
});

test("searching with no match shows a message and a way to browse", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("searchbox", { name: "What do you need?" });
  await box.fill("zzz");
  await box.press("Enter");
  await expect(page.getByText("No trade called “zzz” yet.")).toBeVisible();
  const browse = page.getByRole("link", { name: "Browse all trades" });
  await expect(browse).toHaveAttribute("href", "/trades");
  await expect(page).toHaveURL(/\/$/);
});

test("how it works invites a review", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText("A review in a minute")).toBeVisible();
  await expect(page.getByText("Nobody can pay to rank higher.", { exact: false })).toBeVisible();
  await expect(page.getByText(/coming soon|once reviews open/i)).toHaveCount(0);
});

test("a search that finds nothing is logged, cleaned and without the person", async ({ page }) => {
  await page.goto("/");
  const beacon = page.waitForRequest((r) => r.url().endsWith("/api/search-log") && r.method() === "POST");
  await page.getByRole("searchbox", { name: "What do you need?" }).fill("Zebra tuning 07466");
  await page.getByRole("button", { name: "Find" }).click();
  const body = JSON.parse((await beacon).postData() ?? "{}");
  expect(body).toEqual({ q: "Zebra tuning 07466", matched: false, category: null });
  const res = await page.request.post("/api/search-log", { data: body });
  expect(res.status()).toBe(204);
});
