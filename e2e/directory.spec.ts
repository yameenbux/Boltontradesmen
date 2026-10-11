import { expect, test } from "@playwright/test";

test("category page ranks scored providers and lists newcomers separately", async ({ page }) => {
  await page.goto("/c/plumber");
  const ranked = page.getByTestId("ranked-list");
  await expect(ranked.getByText("Ace Plumbing")).toBeVisible();
  await expect(ranked.getByText("Fresh Pipes")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "New on Bolton Vouched" })).toBeVisible();
  const newcomers = page.getByTestId("newcomers-list");
  await expect(newcomers.getByText("Fresh Pipes")).toBeVisible();
  await expect(newcomers.getByText("Ace Plumbing")).toHaveCount(0);
});

test("district filter hides providers not covering it", async ({ page }) => {
  await page.goto("/c/plumber");
  await expect(page.getByText("Fresh Pipes")).toBeVisible();
  await page.getByLabel("Your area").selectOption("BL3");
  await expect(page.getByText("Fresh Pipes")).toHaveCount(0);
  await expect(page.getByText("Ace Plumbing")).toBeVisible();
  await expect(page.getByText("Half Way Plumbing")).toBeVisible();
});

test("unknown category and provider are 404", async ({ page }) => {
  expect((await page.goto("/c/no-such-thing"))?.status()).toBe(404);
  expect((await page.goto("/p/no-such-person"))?.status()).toBe(404);
});

test("profile shows headline figure, checks, call button and no phone digits", async ({ page }) => {
  const res = await page.goto("/p/e2e-ace-plumbing");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ace Plumbing");
  await expect(page.getByText("Would use again")).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("✓ ID checked Oct 2026")).toBeVisible();
  const call = page.getByRole("link", { name: "Call", exact: true });
  await expect(call).toHaveAttribute("href", "/api/contact/e2e-ace-plumbing?via=call");
  await expect(call).toHaveAttribute("rel", /nofollow/);
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    "/api/contact/e2e-ace-plumbing?via=whatsapp",
  );
  const html = await page.content();
  expect(html).not.toMatch(/\+44|\b07\d{9}\b|44770090/);
});

test("profile without WhatsApp has no WhatsApp button; under 3 reviews shows what's needed", async ({ page }) => {
  await page.goto("/p/e2e-fresh-pipes");
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
  await expect(page.getByText("3 reviews needed for a score")).toBeVisible();
  await expect(page.getByText("No checks yet")).toBeVisible();
  await page.goto("/p/e2e-half-way");
  await expect(page.getByText("3 reviews needed for a score")).toBeVisible();
});

test("no horizontal scroll at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ["/", "/c/plumber", "/p/e2e-ace-plumbing"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, path).toBe(false);
  }
});
