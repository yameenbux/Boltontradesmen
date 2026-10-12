import { expect, test } from "@playwright/test";

test("brand bar shows the name and tagline", async ({ page }) => {
  await page.goto("/platform");
  const header = page.getByRole("banner");
  await expect(header).toContainText("Bolton Vouched");
  await expect(header).toContainText("Local trades & services");
  await expect(header).not.toContainText("Recommended by Bolton");
  await expect(header.getByRole("link", { name: /^Bolton Vouched Local trades/ })).toHaveAttribute("href", "/platform");
});

test("footer names the operator and the registered company", async ({ page }) => {
  await page.goto("/platform");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText(
    "Bolton Vouched is a YSB Designs platform. YSB Designs is a trading name of YSB Ventures Ltd, registered in England and Wales, company number 16022339.",
  );
  await expect(footer).not.toContainText(/yameen/i);
});

test("theme toggle sets data-theme and it applies before DOMContentLoaded after reload", async ({ page }) => {
  // Record the attribute at DOMContentLoaded on every load: proves the head script ran before content, not after hydration.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __themeAtDCL: string | null }).__themeAtDCL =
        document.documentElement.getAttribute("data-theme");
    });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/platform");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);

  await page.getByRole("button", { name: "Switch light or dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => (window as unknown as { __themeAtDCL: string | null }).__themeAtDCL)).toBe("dark");

  await page.getByRole("button", { name: "Switch light or dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { __themeAtDCL: string | null }).__themeAtDCL)).toBe("light");
});

test("theme toggle under a dark system scheme switches to light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/platform");
  await page.getByRole("button", { name: "Switch light or dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("public pages set no cookies after toggling the theme", async ({ page, context }) => {
  await page.goto("/platform");
  await page.getByRole("button", { name: "Switch light or dark" }).click();
  await page.reload();
  expect(await context.cookies()).toEqual([]);
});

test("unknown route shows the branded 404 with links to the trades, home and support", async ({ page }) => {
  const res = await page.goto("/no-such-page-at-all");
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | Bolton Vouched");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(main.getByRole("link", { name: "Browse trades" })).toHaveAttribute("href", "/platform");
  await expect(main.getByRole("link", { name: "Bolton Vouched home" })).toHaveAttribute("href", "/");
  await expect(main.getByRole("link", { name: "support@ysbdesigns.uk" })).toHaveAttribute("href", /^mailto:support@ysbdesigns\.uk\?/);
  await expect(page.getByRole("banner")).toContainText("Bolton Vouched");
  await expect(page.getByRole("contentinfo")).toContainText("YSB Designs platform");
});

test("no horizontal scroll at 360px on /platform", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/platform");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
