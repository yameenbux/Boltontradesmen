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
