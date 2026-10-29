import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL as EMAIL, ADMIN_PASSWORD as PASSWORD, ADMIN_TOTP_SECRET, adminSignIn as signIn, CODE_ADMIN_EMAIL, SETUP_ADMIN_EMAIL, totp } from "./helpers/admin";

async function passwordOnly(page: Page, email: string = EMAIL) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is wrong")).toBeVisible();
});

test("the password alone doesn't open the admin area: it asks for the authenticator code", async ({ page }) => {
  await passwordOnly(page, CODE_ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin\/verify$/);
  await page.goto("/admin/reviews");
  await expect(page).toHaveURL(/\/admin\/verify$/);
  await page.getByLabel("6-digit code").fill(totp(ADMIN_TOTP_SECRET) === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();
});

test("the first sign-in sets up the authenticator: QR code, then its code", async ({ page }) => {
  await passwordOnly(page, SETUP_ADMIN_EMAIL);
  await expect(page.getByRole("heading", { name: "Set up two-step sign-in" })).toBeVisible();
  await page.getByRole("button", { name: "Set up my authenticator" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const secret = (await page.getByTestId("admin-mfa-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
});

test("admin creates a provider and sees the consent link button", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add provider" }).click();

  const name = `E2E Plumbing ${Date.now()}`;
  await page.getByLabel("Business name").fill(name);
  await page.getByRole("textbox", { name: /^Phone/ }).fill("not a number");
  await page.getByLabel("Plumber", { exact: true }).check();
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByText("Enter a valid UK phone number")).toBeVisible();

  await page.getByRole("textbox", { name: /^Phone/ }).fill("07700 900123");
  await page.getByRole("button", { name: "Add provider" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByTestId("provider-status")).toHaveText("invited");
  await expect(page.getByText("+447700900123").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New consent link" })).toBeVisible();
  // A provider's page is in Providers, not Pro ("/admin/providers" starts with "/admin/pro").
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Providers" })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator(`a[href="/admin/pro"]`)).not.toHaveAttribute("aria-current", "page");
});

test("cannot go live without consent", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add provider" }).click();
  await page.getByLabel("Business name").fill(`E2E Live Check ${Date.now()}`);
  await page.getByRole("textbox", { name: /^Phone/ }).fill("07700 900124");
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("invited");
  await expect(page.getByRole("button", { name: "Set live" })).toBeDisabled();
});

test("a removed provider can only come back through Re-invite", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add provider" }).click();
  await page.getByLabel("Business name").fill(`E2E Reinvite ${Date.now()}`);
  await page.getByRole("textbox", { name: /^Phone/ }).fill("07700 900128");
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("invited");
  await expect(page.getByRole("button", { name: "Re-invite" })).toHaveCount(0);

  await page.getByLabel("Reason (required to remove)").fill("Asked to be taken off");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("removed");
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();

  await page.getByRole("button", { name: "Re-invite" }).click();
  await expect(page.getByText("Enter a reason for re-inviting this provider")).toBeVisible();
  await page.getByLabel(/^Reason for re-inviting/).fill("Wants to be listed again");
  await page.getByRole("button", { name: "Re-invite" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("invited");
  await expect(page.getByRole("button", { name: "Copy consent link" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Consent link" })).toHaveValue(/\/consent\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Link expires on \d{1,2} [A-Z][a-z]+ \d{4}$/).first()).toBeVisible();
});

test("the admin home shows the trader sign-up funnel, fed by the For traders page and arrivals from Facebook", async ({ page, browser }, testInfo) => {
  // A visitor (ordinary browser, not headless) reaches For traders; the page sends its funnel beacon.
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, userAgent: "Mozilla/5.0 E2E funnel" });
  const visitor = await ctx.newPage();
  // Arriving from a Facebook post: Facebook adds ?fbclid to the link, so the arrival beacon fires as well as the
  // page's funnel beacon (beacon bodies can't be read here, so count the two requests).
  let views = 0;
  visitor.on("request", (r) => {
    if (r.url().endsWith("/api/view") && r.method() === "POST") views += 1;
  });
  await visitor.goto("/for-traders?fbclid=E2Etest");
  await expect.poll(() => views).toBeGreaterThanOrEqual(2);
  await ctx.close();

  await signIn(page);
  await page.goto("/admin");
  const funnel = page.getByTestId("signup-funnel");
  await expect(funnel.getByRole("heading", { name: "Trader sign-ups" })).toBeVisible();
  await expect(funnel.getByRole("row", { name: /Saw the For traders page/ })).toBeVisible();
  await expect(funnel.getByRole("row", { name: /Went live/ })).toBeVisible();
  // The visit above counts (once a day per connection, so at least 1 even if another spec visited first).
  await expect(async () => {
    await page.reload();
    await expect(funnel.getByRole("row", { name: /Saw the For traders page/ }).getByRole("cell").first()).not.toHaveText("0", { timeout: 1000 });
    await expect(funnel.getByTestId("arrival-fb").getByRole("cell").first()).not.toHaveText("0", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
});
