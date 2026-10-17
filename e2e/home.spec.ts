import { expect, test } from "@playwright/test";

// Fixture (supabase/tests/fixtures/e2e.sql): three live plumbers, four live joiners, plus one live electrician and
// fifteen man & van (review targets for the sign-in and review card specs, and the availability, share, trader
// dashboard, Pro and community questions specs). Every other category is empty.

test("hero shows the headline and the search", async ({ page }) => {
  await page.goto("/platform");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trades your neighbours vouch for.");
  await expect(page.getByRole("searchbox", { name: "What do you need?" })).toBeVisible();
  await expect(page.getByText("Real local reviews")).toBeVisible();
  await expect(page.getByText("Nobody pays to rank")).toBeVisible();
});

test("most asked for shows tiles only for categories with live providers", async ({ page }) => {
  await page.goto("/platform");
  const tiles = page.getByTestId("popular-tiles");
  await expect(tiles.getByRole("link")).toHaveCount(4);
  const plumber = tiles.getByRole("link", { name: /Plumber/ });
  await expect(plumber).toHaveAttribute("href", "/platform/c/plumber");
  // 3 fixture plumbers; consent.spec may set a 4th plumber live (and revalidate /platform) while this runs.
  await expect(plumber).toHaveText(/^Plumber\s*[34] local pros$/);
});

test("everything else groups show counts, links for live categories and 'soon' chips for empty ones", async ({ page }) => {
  await page.goto("/platform");
  for (const name of [
    "Home & trades",
    "Repairs & appliances",
    "Moving & waste",
    "Events & occasions",
    "Personal & lessons",
    "Vehicles",
  ]) {
    await expect(page.locator("details.group > summary", { hasText: name })).toBeVisible();
  }
  const home = page.locator("details", { hasText: "Home & trades" });
  await expect(home.locator("summary")).toContainText("· 3 with pros");
  await home.locator("summary").click();
  await expect(home.getByRole("link", { name: /Plumber/ })).toHaveAttribute("href", "/platform/c/plumber");
  // Empty categories are plain text, not links.
  await expect(home.getByText("Tiler")).toBeVisible();
  await expect(home.locator('a[href="/platform/c/tiler"]')).toHaveCount(0);
  await expect(home.locator(".chip.soon", { hasText: "Tiler" })).toContainText("soon");

  const events = page.locator("details", { hasText: "Events & occasions" });
  await expect(events.locator("summary")).toContainText("· 0 with pros");
});

test("searching a partial trade goes to its category page", async ({ page }) => {
  await page.goto("/platform");
  const box = page.getByRole("searchbox", { name: "What do you need?" });
  await box.fill("  Plumb ");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/c\/plumber$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the Find button submits too, and empty categories still navigate", async ({ page }) => {
  await page.goto("/platform");
  await page.getByRole("searchbox", { name: "What do you need?" }).fill("bouncy");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/\/c\/bouncy-castles$/);
});

test("searching with no match shows a message and a way to browse", async ({ page }) => {
  await page.goto("/platform");
  const box = page.getByRole("searchbox", { name: "What do you need?" });
  await box.fill("zzz");
  await box.press("Enter");
  await expect(page.getByText("No trade called “zzz” yet.")).toBeVisible();
  const browse = page.getByRole("link", { name: "Browse all trades" });
  await expect(browse).toHaveAttribute("href", "#all-trades");
  await expect(page).toHaveURL(/\/platform$/);
});

test("how it works invites a review", async ({ page }) => {
  await page.goto("/platform");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText("Leave a review in a minute")).toBeVisible();
  await expect(page.getByText(/coming soon|once reviews open/i)).toHaveCount(0);
});

test("a search that finds nothing is logged, cleaned and without the person", async ({ page }) => {
  await page.goto("/platform");
  const beacon = page.waitForRequest((r) => r.url().endsWith("/api/search-log") && r.method() === "POST");
  await page.getByRole("searchbox", { name: "What do you need?" }).fill("Zebra tuning 07466");
  await page.getByRole("button", { name: "Find" }).click();
  const body = JSON.parse((await beacon).postData() ?? "{}");
  expect(body).toEqual({ q: "Zebra tuning 07466", matched: false, category: null });
  const res = await page.request.post("/api/search-log", { data: body });
  expect(res.status()).toBe(204);
});
