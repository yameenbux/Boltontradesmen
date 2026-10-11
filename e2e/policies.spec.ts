import { expect, test } from "@playwright/test";

const policies = [
  { path: "/privacy", heading: /privacy/i },
  { path: "/terms", heading: /terms/i },
  { path: "/how-ratings-work", heading: /ratings work/i },
];

for (const { path, heading } of policies) {
  test(`${path} returns 200 with an h1 and the draft banner`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByText("Draft — pending legal review")).toBeVisible();
  });
}

for (const start of ["/platform", "/privacy", "/terms", "/how-ratings-work", "/admin/login"]) {
  test(`footer on ${start} links to the policy pages`, async ({ page }) => {
    await page.goto(start);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: "How ratings work" })).toHaveAttribute(
      "href",
      "/how-ratings-work",
    );
  });
}

test("privacy notice covers controller, rights and the ICO", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText("ico.org.uk").first()).toBeVisible();
  await expect(page.getByText("hello@example.com").first()).toBeVisible();
});

test("how ratings work states the minimum and that payment never affects ranking", async ({ page }) => {
  await page.goto("/how-ratings-work");
  await expect(page.getByText("Payment never affects ranking").first()).toBeVisible();
  await expect(page.getByText(/3 reviews/).first()).toBeVisible();
});

for (const { path } of policies) {
  test(`${path} shows no literal HTML entities`, async ({ page }) => {
    await page.goto(path);
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("&apos;");
    expect(text).not.toContain("&amp;");
  });
}

for (const path of ["/privacy", "/admin/login"]) {
  test(`no horizontal scroll at 360px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
