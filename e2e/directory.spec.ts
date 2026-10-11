import { expect, test } from "@playwright/test";

test("category page ranks scored providers and lists newcomers separately", async ({ page }) => {
  await page.goto("/c/plumber");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plumber");
  await expect(page.getByText(/^\d+ local pros · ranked by people who'd use them again$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "All trades" })).toHaveAttribute("href", "/");

  const ranked = page.getByTestId("ranked-list");
  const ace = ranked.getByRole("link", { name: /Ace Plumbing/ });
  await expect(ace).toHaveAttribute("href", "/p/e2e-ace-plumbing");
  await expect(ace.getByTestId("score")).toHaveText(/^100%\s*would use again\s*4 reviews$/);
  await expect(ace.getByText("Verified")).toBeVisible();
  await expect(ace.getByText("BL1 · BL3 · BL4")).toBeVisible();
  await expect(ace.getByText("AP", { exact: true })).toBeVisible();
  await expect(ranked.getByText("Fresh Pipes")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "New on Bolton Vouched" })).toBeVisible();
  await expect(page.getByText("Under 3 reviews", { exact: true })).toBeVisible();
  const newcomers = page.getByTestId("newcomers-list");
  await expect(newcomers.getByRole("link", { name: /Fresh Pipes/ })).toContainText("No reviews yet");
  await expect(newcomers.getByRole("link", { name: /Half Way Plumbing/ })).toContainText("2 reviews so far");
  await expect(newcomers.getByText("Ace Plumbing")).toHaveCount(0);
});

test("area chips filter providers and show an empty state when none cover the area", async ({ page }) => {
  await page.goto("/c/plumber");
  const areas = page.getByRole("group", { name: "Your area" });
  await expect(areas.getByRole("button", { name: "All of Bolton" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Fresh Pipes")).toBeVisible();

  // The keyboard focus ring (outline + offset) must fit inside the scrolling chip row, which clips it otherwise.
  await page.getByRole("link", { name: "All trades" }).focus();
  await page.keyboard.press("Tab");
  await expect(areas.getByRole("button", { name: "All of Bolton" })).toBeFocused();
  const ring = await areas.evaluate((row) => {
    const chip = document.activeElement as HTMLElement;
    const cs = getComputedStyle(chip);
    const reach = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    return { style: cs.outlineStyle, reach, above: c.top - r.top, below: r.bottom - c.bottom };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.reach).toBeGreaterThan(0);
  expect(ring.above).toBeGreaterThanOrEqual(ring.reach);
  expect(ring.below).toBeGreaterThanOrEqual(ring.reach);

  await areas.getByRole("button", { name: "BL3" }).click();
  await expect(areas.getByRole("button", { name: "BL3" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Fresh Pipes")).toHaveCount(0);
  await expect(page.getByText("Ace Plumbing")).toBeVisible();
  await expect(page.getByText("Half Way Plumbing")).toBeVisible();

  await areas.getByRole("button", { name: "BL7" }).click();
  await expect(page.getByText("Ace Plumbing")).toHaveCount(0);
  await expect(page.getByText(/Nobody listed for BL7 yet/)).toBeVisible();

  await areas.getByRole("button", { name: "All of Bolton" }).click();
  await expect(page.getByText("Ace Plumbing")).toBeVisible();
  await expect(page.getByText(/Nobody listed for/)).toHaveCount(0);
});

test("category with no live providers shows a friendly empty state and its guidance note", async ({ page }) => {
  const res = await page.goto("/c/electrician");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Electrician");
  await expect(page.getByText(/NICEIC\/NAPIT/)).toBeVisible();
  await expect(page.getByText("Nobody's listed for Electrician yet.")).toBeVisible();
  await expect(page.getByText("Know a good one? Message the group admin to get them added.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse other trades" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("group", { name: "Your area" })).toHaveCount(0);
  await expect(page.getByTestId("ranked-list")).toHaveCount(0);
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
  for (const path of ["/", "/c/plumber", "/c/electrician", "/p/e2e-ace-plumbing"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, path).toBe(false);
  }
});
