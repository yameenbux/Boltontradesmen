import { expect, test } from "@playwright/test";

// The platform lives under /platform so the root can become a showcase site; old links redirect permanently.

test("/platform shows the directory home", async ({ page }) => {
  const res = await page.goto("/platform");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Who's good round here?");
  await expect(page.getByRole("banner").getByRole("link", { name: "Bolton Vouched home" })).toHaveAttribute(
    "href",
    "/platform",
  );
});

for (const [from, to] of [
  ["/c/plumber", "/platform/c/plumber"],
  ["/p/e2e-ace-plumbing", "/platform/p/e2e-ace-plumbing"],
  ["/consent/00000000-0000-0000-0000-000000000000", "/platform/consent/00000000-0000-0000-0000-000000000000"],
]) {
  test(`${from} redirects permanently to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(to);
  });
}

test("the root sends visitors to the platform for now", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/platform$/);
});

test("the manifest makes /platform an installable standalone app", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({
    name: "Bolton Vouched",
    short_name: "Vouched",
    start_url: "/platform",
    scope: "/platform",
    display: "standalone",
    theme_color: "#9C3A25",
  });
  const icons = m.icons as { src: string; sizes: string; purpose?: string }[];
  expect(icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  for (const icon of icons) {
    const img = await request.get(icon.src);
    expect(img.status(), icon.src).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");
  }
});

test("/platform head has the home-screen metadata", async ({ request }) => {
  const html = await (await request.get("/platform")).text();
  expect(html).toMatch(/<link[^>]+rel="apple-touch-icon"[^>]+href="\/icons\/apple-touch-icon\.png"/);
  expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"/>');
  expect(html).toMatch(/<meta name="theme-color"[^>]+content="#9C3A25"/);
  expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
  const touch = await request.get("/icons/apple-touch-icon.png");
  expect(touch.status()).toBe(200);
});

test("admin consent links point at /platform/consent/", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Add provider" }).click();
  await page.getByLabel("Business name").fill(`E2E PWA Link ${Date.now()}`);
  await page.getByRole("textbox", { name: /^Phone/ }).fill("07700 900128");
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("invited");
  await page.getByRole("button", { name: "New consent link" }).click();
  await expect(page.getByRole("textbox", { name: "Consent link" })).toHaveValue(/\/platform\/consent\/[0-9a-f-]{36}$/);
});
