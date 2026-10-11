import { expect, test } from "@playwright/test";

// OWNER_LEGAL_NAME comes from .env.example via playwright.config.ts (or CI's environment).
const owner = process.env.OWNER_LEGAL_NAME ?? "";

test("brand bar shows the name and tagline", async ({ page }) => {
  await page.goto("/platform");
  const header = page.getByRole("banner");
  await expect(header).toContainText("Bolton Vouched");
  await expect(header).toContainText("Recommended by Bolton");
  await expect(header.getByRole("link", { name: "Bolton Vouched home" })).toHaveAttribute("href", "/platform");
});

test("footer names the operator", async ({ page }) => {
  expect(owner).not.toBe("");
  await page.goto("/platform");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("operated by");
  await expect(footer).toContainText(`Bolton Vouched is operated by ${owner}.`);
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

test("unknown route shows the branded 404 with a link home", async ({ page }) => {
  const res = await page.goto("/no-such-page-at-all");
  expect(res?.status()).toBe(404);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(main.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/platform");
  await expect(page.getByRole("banner")).toContainText("Bolton Vouched");
  await expect(page.getByRole("contentinfo")).toContainText("operated by");
});

test("no horizontal scroll at 360px on /platform", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/platform");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
