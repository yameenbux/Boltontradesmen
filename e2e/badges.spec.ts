import { expect, test } from "@playwright/test";

// Fixture (supabase/tests/fixtures/e2e.sql): Pine Joinery has 5 five-star "would use again" reviews, so it is Top
// rated; Ace Plumbing has 4 just as good, so it has no badge yet (5 are needed).

test("a provider with 5 top reviews shows Top rated on its profile and its card", async ({ page }) => {
  await page.goto("/p/e2e-pine-joinery");
  const header = page.locator(".prof-head");
  await expect(header.getByTestId("rating-badge")).toHaveText("Top rated");
  await expect(page.getByTestId("headline")).toHaveText("100%");

  await page.goto("/c/joiner");
  const pine = page.getByTestId("ranked-list").getByRole("link", { name: /Pine Joinery/ });
  await expect(pine.getByTestId("rating-badge")).toHaveText("Top rated");
  await expect(pine.getByTestId("score")).toContainText("5 reviews");
  // Only Pine has earned one in this trade.
  await expect(page.getByTestId("rating-badge")).toHaveCount(1);
});

test("a provider with 4 reviews shows no badge, however good", async ({ page }) => {
  await page.goto("/p/e2e-ace-plumbing");
  await expect(page.getByTestId("headline")).toHaveText("100%");
  await expect(page.getByTestId("rating-badge")).toHaveCount(0);

  await page.goto("/c/plumber");
  const ace = page.getByTestId("ranked-list").getByRole("link", { name: /Ace Plumbing/ });
  await expect(ace.getByTestId("score")).toContainText("4 reviews");
  await expect(page.getByTestId("rating-badge")).toHaveCount(0);
});

test("badges stay out of the structured data", async ({ page }) => {
  await page.goto("/p/e2e-pine-joinery");
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
  expect(ld).not.toMatch(/Top rated|Highly rated|aggregateRating/i);
});

test("How ratings work explains the badges", async ({ page }) => {
  await page.goto("/how-ratings-work");
  await expect(page.getByRole("heading", { name: "Badges" })).toBeVisible();
  await expect(page.getByText("Top rated: a quality score of 4.5 or more and 90% or more would use them again.")).toBeVisible();
  await expect(page.getByText(/Nobody can buy a badge or pay for one/)).toBeVisible();
});
