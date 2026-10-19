import { expect, test } from "@playwright/test";
import { latestCode, E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

const SARAH = `sarah@${E2E_EMAIL_DOMAIN}`;

test("a new resident signs in with an email code and sets up their name", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in or create an account");
  const after = new Date(Date.now() - 1000);
  await page.getByLabel("Your email address").fill(SARAH);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(`We've sent a 6-digit code to ${SARAH}`)).toBeVisible();
  await page.getByLabel("6-digit code").fill(await latestCode(SARAH, after));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/welcome/);
  await page.getByLabel("First name").fill("Sarah");
  await page.getByLabel("Surname").fill("Khan");
  await page.getByLabel("Your area").selectOption("BL3");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Signed in: straight to the directory, greeted by name (the account page is behind the profile icon).
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("greeting")).toHaveText(/^Good (morning|afternoon|evening), Sarah$/);
  await page.goto("/account");
  await expect(page.getByRole("main").getByText("Signed in as Sarah K.")).toBeVisible();
});

test("a wrong email code shows a plain message and keeps the code step", async ({ page }) => {
  const email = `wrong-code@${E2E_EMAIL_DOMAIN}`;
  await page.goto("/sign-in");
  await page.getByLabel("Your email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(`We've sent a 6-digit code to ${email}`)).toBeVisible();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That code didn't work. Check the email and try again, or send a new code.",
  );
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  // "Use a different address" goes back to the address step with it filled in.
  await page.getByRole("button", { name: "Use a different address" }).click();
  await expect(page.getByLabel("Your email address")).toHaveValue(email);
});

test("a throwaway address is refused before any code is sent", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Your email address").fill("x@mailinator.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Please use your own email address. Temporary or throwaway addresses can't sign in.",
  );
  await expect(page.getByLabel("6-digit code")).toHaveCount(0);
});

test("the sign-in page offers Google, then email under the 'or use your email' divider, and no phone", async ({ page }) => {
  await page.goto("/sign-in");
  const card = page.locator(".auth-card");
  const divider = card.locator(".or-divider");
  await expect(divider).toHaveCount(1);
  await expect(divider).toHaveText("or use your email");
  const google = page.getByRole("button", { name: "Continue with Google" });
  const email = page.getByLabel("Your email address");
  const [g, d, e] = await Promise.all([google.boundingBox(), divider.boundingBox(), email.boundingBox()]);
  expect(g!.y).toBeLessThan(d!.y);
  expect(d!.y).toBeLessThan(e!.y);
  // Production's setting (SIGN_IN_PHONE off): no mobile number field.
  await expect(page.getByLabel("Your mobile number")).toHaveCount(0);
  await expect(page.getByText("Your email address is only used to sign you in. It's never shown on the site.")).toBeVisible();
});

// Final review I2: Turnstile is off when its keys are unset (local and CI): no widget, no Cloudflare script, and
// the code is still sent (the first test above). Production sets both keys (docs/launch/LAUNCH.md Step 3d).
test("without Turnstile keys there is no widget or Cloudflare script on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(page.getByTestId("turnstile")).toHaveCount(0);
  await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveCount(0);
});
