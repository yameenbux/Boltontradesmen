import { expect, test } from "@playwright/test";

// The showcase site at "/" (the platform itself lives at /platform).

test("/ shows the hero and sends people to the platform", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("Anyone know a good");
  await expect(h1).toContainText("Bolton already does.");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Open the platform" }).first()).toHaveAttribute("href", "/platform");
  await expect(page.getByRole("banner").getByRole("link", { name: "Open the platform" })).toHaveAttribute(
    "href",
    "/platform",
  );
  await expect(main.getByRole("link", { name: "Add it to your phone" }).first()).toHaveAttribute("href", "#install");
  await expect(main).toContainText("Free · No sign-up · Made in Bolton");
  // Real screenshots in the phone mockups.
  const shot = page.locator(".phone-fan img").first();
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // The screenshots show made-up listings, and say so.
  for (const alt of await page
    .locator(".phone-fan img")
    .evaluateAll((imgs) => imgs.map((i) => i.getAttribute("alt")))) {
    expect(alt).toMatch(/^Sample listing/);
  }
  await expect(page.locator(".phone-fan + .s-sample")).toHaveText("Sample listings shown");
  await expect(page.locator("#traders")).toContainText("Sample listing shown");
});

test("nav anchors scroll to their sections", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Sections" });
  for (const [name, id] of [
    ["How it works", "how"],
    ["Inside", "inside"],
    ["For traders", "traders"],
    ["Support", "support"],
  ]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
  await expect(nav.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
});

test("on a phone the menu reaches the sections and closes after a tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Open the platform" })).toHaveAttribute("href", "/platform");
  const menu = banner.locator("details.s-menu");
  await banner.getByLabel("Menu").click();
  await expect(menu).toHaveAttribute("open", "");
  await menu.getByRole("link", { name: "Support" }).click();
  await expect(page).toHaveURL(/#support$/);
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(page.locator("#support")).toBeInViewport();
});

test("the card deck advances with the arrows and shows a counter", async ({ page }) => {
  await page.goto("/");
  const deck = page.getByRole("region", { name: "Inside Bolton Vouched" });
  await deck.scrollIntoViewIfNeeded();
  const counter = deck.getByTestId("deck-counter");
  await deck.getByRole("button", { name: /pause/i }).click();
  await expect(counter).toHaveText("01 / 07");
  await deck.getByRole("button", { name: "Next card" }).click();
  await expect(counter).toHaveText("02 / 07");
  await deck.getByRole("button", { name: "Previous card" }).click();
  await deck.getByRole("button", { name: "Previous card" }).click();
  await expect(counter).toHaveText("07 / 07");
});

test("install steps cover iPhone and Android", async ({ page }) => {
  await page.goto("/");
  const install = page.locator("#install");
  await expect(install).toContainText("Add to Home Screen");
  await expect(install).toContainText("Safari");
  await expect(install).toContainText("Chrome");
  await expect(install).toContainText("Install app");
});

test("traders can see how to get listed", async ({ page }) => {
  await page.goto("/");
  const traders = page.locator("#traders");
  await expect(traders).toContainText("support@ysbdesigns.uk");
  await expect(traders.getByRole("link", { name: "Raise a ticket" })).toHaveAttribute(
    "href",
    "mailto:support@ysbdesigns.uk?subject=Bolton%20Vouched%3A%20please%20list%20me",
  );
  await expect(traders).not.toContainText("yameen@");
});

test("FAQ search filters questions and says when nothing matches", async ({ page }) => {
  await page.goto("/");
  const support = page.locator("#support");
  const search = support.getByRole("searchbox", { name: "Search questions" });
  const questions = support.locator("details.faq-item");
  const total = await questions.count();
  expect(total).toBeGreaterThanOrEqual(8);

  await search.fill("  PAY ");
  await expect(support.locator("details.faq-item:visible")).not.toHaveCount(total);
  await expect(support.getByText("Can a trader pay to rank higher?")).toBeVisible();
  await expect(support.getByText("Who runs Bolton Vouched?")).toBeHidden();

  await search.fill("zzqxj");
  await expect(support.locator("details.faq-item:visible")).toHaveCount(0);
  await expect(support).toContainText("No questions match that. Try another word, or raise a support ticket below.");

  await search.fill("");
  await expect(support.locator("details.faq-item:visible")).toHaveCount(total);
});

test("footer names the company and links the policies", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText(
    "Bolton Vouched is operated by YSB Ventures Ltd, registered in England and Wales, company number 16022339.",
  );
  await expect(footer.getByRole("link", { name: "support@ysbdesigns.uk" })).toHaveAttribute(
    "href",
    "mailto:support@ysbdesigns.uk?subject=Bolton%20Vouched%3A%20support%20request",
  );
  for (const [name, href] of [
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["How ratings work", "/how-ratings-work"],
    ["Open the platform", "/platform"],
  ]) {
    await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
});

test("no horizontal scroll at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  // Walk the page so reveal-on-scroll content is laid out in its final place.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 30));
    }
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("reduced motion: no animations, no hidden reveal content, deck does not auto-advance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const running = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().duration ?? 0) !== 0)
        .length,
  );
  expect(running).toBe(0);
  // Reveal content is fully visible without scrolling to it.
  const faded = await page.evaluate(
    () => [...document.querySelectorAll(".reveal")].filter((el) => getComputedStyle(el).opacity !== "1").length,
  );
  expect(faded).toBe(0);
  const counter = page.getByTestId("deck-counter");
  await expect(counter).toHaveText("01 / 07");
  await page.waitForTimeout(6500);
  await expect(counter).toHaveText("01 / 07");
});

test("content is visible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const id of ["how", "install", "traders", "support"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const hidden = await page
      .locator(`#${id} .reveal`)
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== "1").length);
    expect(hidden, id).toBe(0);
  }
  await context.close();
});

test("the page is static, cookie-free and has social metadata", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const headers = res.headers();
  expect(headers["set-cookie"]).toBeUndefined();
  // Prerendered at build time: Next marks static HTML with the prerender header and serves it from cache.
  expect(headers["x-nextjs-prerender"] ?? headers["x-nextjs-cache"]).toBeTruthy();
  const html = await res.text();
  expect(html).toContain("<title>Bolton Vouched · Who&#x27;s good round here?</title>");
  expect(html).toMatch(/<meta property="og:title" content="Bolton Vouched · Who&#x27;s good round here\?"/);
  expect(html).toMatch(/<meta property="og:image" content="[^"]*\/social\.png"/);
  expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
  const img = await request.get("/social.png");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
});
