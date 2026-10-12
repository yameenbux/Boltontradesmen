import { expect, test } from "@playwright/test";

test("category page ranks scored providers and lists newcomers separately", async ({ page }) => {
  await page.goto("/platform/c/plumber");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plumber");
  await expect(page.getByText(/^\d+ local pros? · ranked by reviews$/)).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Trades", exact: true })).toHaveAttribute("href", "/platform");
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("Plumber");

  const ranked = page.getByTestId("ranked-list");
  const ace = ranked.getByRole("link", { name: /Ace Plumbing/ });
  await expect(ace).toHaveAttribute("href", "/platform/p/e2e-ace-plumbing");
  await expect(ace.getByTestId("score")).toHaveText(/^100%\s*would use again\s*4 reviews · 1 verified job$/);
  await expect(ace.getByText("Verified", { exact: true })).toBeVisible();
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
  await page.goto("/platform/c/plumber");
  const areas = page.getByRole("group", { name: "Your area" });
  await expect(areas.getByRole("button", { name: "All of Bolton" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Fresh Pipes")).toBeVisible();

  // The keyboard focus ring (outline + offset) must fit inside the scrolling chip row, which clips it otherwise.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Trades", exact: true }).focus();
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

test("category with no live providers shows a friendly empty state", async ({ page }) => {
  const res = await page.goto("/platform/c/roofer");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roofer");
  await expect(page.getByText("Nobody's listed for Roofer yet.")).toBeVisible();
  await expect(page.getByText("Know a good one? Message the group admin to get them added.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse other trades" })).toHaveAttribute("href", "/platform");
  await expect(page.getByRole("group", { name: "Your area" })).toHaveCount(0);
  await expect(page.getByTestId("ranked-list")).toHaveCount(0);
});

test("a category's guidance note shows at the top", async ({ page }) => {
  await page.goto("/platform/c/electrician");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Electrician");
  await expect(page.getByText(/NICEIC\/NAPIT/)).toBeVisible();
});

test("unknown category and provider are 404", async ({ page }) => {
  expect((await page.goto("/platform/c/no-such-thing"))?.status()).toBe(404);
  expect((await page.goto("/platform/p/no-such-person"))?.status()).toBe(404);
});

test("profile shows the header, stat card, checks list and about card", async ({ page }) => {
  const res = await page.goto("/platform/p/e2e-ace-plumbing");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ace Plumbing");
  await expect(page.getByText("Alan Ace · Plumber")).toBeVisible();
  await expect(page.getByText("Covers BL1, BL3, BL4")).toBeVisible();
  await expect(page.locator(".prof-head").getByText("Verified")).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Trades", exact: true })).toHaveAttribute("href", "/platform");
  await expect(crumbs.getByRole("link", { name: "Plumber", exact: true })).toHaveAttribute("href", "/platform/c/plumber");
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("Ace Plumbing");

  const stat = page.getByRole("region", { name: "What people say" });
  await expect(stat.getByText("Would use again")).toBeVisible();
  await expect(stat.getByTestId("headline")).toHaveText("100%");
  await expect(stat.getByText("From 4 reviews by Bolton residents")).toBeVisible();
  // Fixture reviews answer on time and on price but not tidiness, so only those two bars show.
  await expect(stat.getByTestId("bar-row")).toHaveText([/Turned up when they said\s*100%/, /Stuck to the quote\s*100%/]);
  await expect(stat.getByText("Quality of work")).toBeVisible();
  await expect(stat.getByLabel(/^\d\.\d out of 5$/)).toBeVisible();

  const checks = page.getByRole("region", { name: "What we've checked" });
  await expect(checks.getByRole("listitem")).toHaveText([
    /ID checked\s*October 2026/,
    /Public liability insurance\s*Valid until March 2099/,
    /Trade accreditations\s*None provided/,
  ]);

  await expect(page.getByRole("region", { name: "About" })).toContainText("Boilers, leaks and bathrooms across Bolton.");
});

test("profile lists reviews with Verified job and Group member filters", async ({ page }) => {
  await page.goto("/platform/p/e2e-ace-plumbing");
  const section = page.getByRole("region", { name: /^Reviews/ });
  const items = section.getByRole("article");
  await expect(items).toHaveCount(4);
  for (const name of ["Pat P.", "Jo B.", "Sam T.", "Ali R."]) await expect(section.getByText(name, { exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: "Leave a review" })).toHaveAttribute(
    "href",
    "/platform/p/e2e-ace-plumbing/review",
  );

  const verified = section.getByRole("button", { name: /Verified job/ });
  await verified.click();
  await expect(verified).toHaveAttribute("aria-pressed", "true");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Pat P.");
  await expect(items.first().getByText("Verified job", { exact: true })).toBeVisible();
  await verified.click();
  await expect(items).toHaveCount(4);

  await section.getByRole("button", { name: /Group member/ }).click();
  await expect(items).toHaveCount(2);

  const report = items.first().getByRole("link", { name: "Report" });
  await expect(report).toHaveAttribute("href", /^\/platform\/report\/[0-9a-f-]{36}$/);
  await expect(report).toHaveAttribute("rel", /nofollow/);
});

test("an under-check review stays visible with its label; a profile with no reviews invites one", async ({ page }) => {
  await page.goto("/platform/p/e2e-calm-carpentry");
  const section = page.getByRole("region", { name: /^Reviews/ });
  await expect(section.getByRole("article")).toHaveCount(1);
  await expect(section.getByText("Under check", { exact: true })).toBeVisible();
  await expect(section.getByText("This review is being checked. It still counts while we look.")).toBeVisible();

  await page.goto("/platform/p/e2e-tidy-vans");
  const empty = page.getByRole("region", { name: /^Reviews/ });
  await expect(empty.getByText("No reviews yet. Used them? Be the first to leave one.")).toBeVisible();
  await expect(empty.getByRole("link", { name: "Leave a review" })).toHaveAttribute("href", "/platform/p/e2e-tidy-vans/review");
});

test("profile action bar calls by first name, sits at the viewport bottom and hides nothing", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  // Arrive by client-side navigation so the route enter animation is running when the bar mounts.
  await page.goto("/platform/c/plumber");
  await page.getByTestId("ranked-list").getByRole("link", { name: /Ace Plumbing/ }).click();
  await expect(page).toHaveURL(/\/p\/e2e-ace-plumbing$/);

  const bar = page.getByRole("region", { name: "Contact Ace Plumbing" });
  const call = bar.getByRole("link", { name: "Call Alan" });
  await expect(call).toHaveAttribute("href", "/api/contact/e2e-ace-plumbing?via=call");
  await expect(call).toHaveAttribute("rel", /nofollow/);
  const whatsapp = bar.getByRole("link", { name: "WhatsApp" });
  await expect(whatsapp).toHaveAttribute("href", "/api/contact/e2e-ace-plumbing?via=whatsapp");
  await expect(whatsapp).toHaveAttribute("rel", /nofollow/);

  // Fixed to the viewport, never inside the animated (transformed) route wrapper.
  const placement = await bar.evaluate((el) => ({
    inWrapper: el.closest(".page-enter") !== null,
    position: getComputedStyle(el).position,
  }));
  expect(placement).toEqual({ inWrapper: false, position: "fixed" });

  const settle = () =>
    page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await settle();
  const box = await bar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
  });
  expect(Math.abs(box.bottom - box.vh)).toBeLessThanOrEqual(1);

  // Scrolled to the very end, the footer clears the bar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footBottom = await page.locator(".foot").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(footBottom).toBeLessThanOrEqual(box.top + 1);

  // Hard load too: the bar ends up at the viewport bottom.
  await page.reload();
  await settle();
  const after = await bar.evaluate((el) => ({
    inWrapper: el.closest(".page-enter") !== null,
    bottom: el.getBoundingClientRect().bottom,
    vh: window.innerHeight,
  }));
  expect(after.inWrapper).toBe(false);
  expect(Math.abs(after.bottom - after.vh)).toBeLessThanOrEqual(1);

  // Raw server HTML: contact links present, no phone digits anywhere.
  const html = await (await request.get("/platform/p/e2e-ace-plumbing")).text();
  expect(html).toContain('href="/api/contact/e2e-ace-plumbing?via=call"');
  expect(html).not.toMatch(/\+44|\b07\d{9}\b|44770090|7700900/);
});

test("profile without WhatsApp or reviews: one call button, and what's needed for a score", async ({ page }) => {
  await page.goto("/platform/p/e2e-fresh-pipes");
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Call Fran" })).toHaveAttribute(
    "href",
    "/api/contact/e2e-fresh-pipes?via=call",
  );
  const stat = page.getByRole("region", { name: "What people say" });
  await expect(stat.getByText("3 reviews needed for a score")).toBeVisible();
  await expect(stat.getByText("No reviews yet")).toBeVisible();
  await expect(page.getByRole("region", { name: "What we've checked" }).getByRole("listitem")).toHaveText([
    /Trade accreditations\s*None provided/,
  ]);
  await expect(page.getByRole("region", { name: "About" })).toHaveCount(0);

  await page.goto("/platform/p/e2e-half-way");
  await expect(page.getByText("3 reviews needed for a score")).toBeVisible();
  await expect(page.getByText("2 reviews so far")).toBeVisible();
  // No contact name: the button just says Call.
  await expect(page.getByRole("link", { name: "Call", exact: true })).toHaveAttribute(
    "href",
    "/api/contact/e2e-half-way?via=call",
  );
});

test("no horizontal scroll at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ["/platform", "/platform/c/plumber", "/platform/c/electrician", "/platform/p/e2e-ace-plumbing"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, path).toBe(false);
  }
});
