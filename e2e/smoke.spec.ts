import { expect, test } from "@playwright/test";

test("home page shows the product name and the hero headline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Bolton Vouched");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trades your neighbours vouch for.");
});
