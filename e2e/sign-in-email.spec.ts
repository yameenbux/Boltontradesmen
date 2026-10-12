import { expect, test } from "@playwright/test";
import { latestCode, E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

const SARAH = `sarah@${E2E_EMAIL_DOMAIN}`;

test("a new resident signs in with an email code and sets up their name", async ({ page }) => {
  await page.goto("/platform/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to Bolton Vouched");
  const after = new Date(Date.now() - 1000);
  await page.getByLabel("Your email address").fill(SARAH);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(`We've sent a 6-digit code to ${SARAH}`)).toBeVisible();
  await page.getByLabel("6-digit code").fill(await latestCode(SARAH, after));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/platform\/welcome/);
  await page.getByLabel("First name").fill("Sarah");
  await page.getByLabel("Surname").fill("Khan");
  await page.getByLabel("Your area").selectOption("BL3");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page).toHaveURL(/\/platform\/account$/);
  await expect(page.getByRole("main").getByText("Signed in as Sarah K.")).toBeVisible();
});

test("a wrong email code shows a plain message and keeps the code step", async ({ page }) => {
  const email = `wrong-code@${E2E_EMAIL_DOMAIN}`;
  await page.goto("/platform/sign-in");
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
  await page.goto("/platform/sign-in");
  await page.getByLabel("Your email address").fill("x@mailinator.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Please use your own email address. Temporary or throwaway addresses can't sign in.",
  );
  await expect(page.getByLabel("6-digit code")).toHaveCount(0);
});

test("the sign-in page puts the email form under the 'or use your email' divider, then phone when it's on", async ({ page }) => {
  await page.goto("/platform/sign-in");
  const card = page.locator(".auth-card");
  const divider = card.locator(".or-divider").first();
  await expect(divider).toHaveText("or use your email");
  const email = page.getByLabel("Your email address");
  const phone = page.getByLabel("Your mobile number");
  // The E2E server still runs with SIGN_IN_PHONE=on until Plan 2b Task 10.
  await expect(phone).toBeVisible();
  const [d, e, p] = await Promise.all([divider.boundingBox(), email.boundingBox(), phone.boundingBox()]);
  expect(d!.y).toBeLessThan(e!.y);
  expect(e!.y).toBeLessThan(p!.y);
  await expect(page.getByText("Your email address is only used to sign you in. It's never shown on the site.")).toBeVisible();
});
