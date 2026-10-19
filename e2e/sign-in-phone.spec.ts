import { expect, test } from "@playwright/test";

// Runs in the "phone" Playwright project: the app on :3001 with SIGN_IN_PHONE=on.
import { signInWithPhone } from "./helpers/phone";

test("with phone sign-in on, the page offers Google, an email code and a mobile number", async ({ page }) => {
  await page.goto("/platform/sign-in");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByLabel("Your email address")).toBeVisible();
  await expect(page.getByLabel("Your mobile number")).toBeVisible();
  const [e, p] = await Promise.all([
    page.getByLabel("Your email address").boundingBox(),
    page.getByLabel("Your mobile number").boundingBox(),
  ]);
  expect(e!.y).toBeLessThan(p!.y);
  await expect(page.getByText("or use your mobile")).toBeVisible();
});

test("a new resident signs in with a code and sets up their name", async ({ page }) => {
  await page.goto("/platform/sign-in");
  await page.getByLabel("Your mobile number").fill("07700 900401");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByText("We've sent a 6-digit code to 07700 900401")).toBeVisible();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/platform\/welcome/);
  await page.getByLabel("First name").fill("sarah");
  await page.getByLabel("Surname").fill("Khan");
  await page.getByLabel("Your area").selectOption("BL3");
  await expect(page.getByLabel(/Group code/)).toHaveCount(0);
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Signed in: straight to the directory, greeted by name (the account page is behind the profile icon).
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByTestId("greeting")).toHaveText(/^Good (morning|afternoon|evening), Sarah$/);
  await page.goto("/platform/account");
  await expect(page.getByRole("main").getByText("Signed in as Sarah K.")).toBeVisible();
});

test("a wrong code shows a plain message", async ({ page }) => {
  await page.goto("/platform/sign-in");
  await page.getByLabel("Your mobile number").fill("07700 900402");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "That code didn't work. Check the text and try again, or send a new code.",
  );
});

for (const [number, copy] of [
  ["07700 900666", "This looks like an internet or virtual number. Please use your own UK mobile number."],
  ["07700 900999", "We couldn't check your number just now. Please try again in a minute."],
  ["01204 123456", "Enter a UK mobile number, like 07700 900123."],
] as const) {
  test(`${number} is refused before any code is sent`, async ({ page }) => {
    await page.goto("/platform/sign-in");
    await page.getByLabel("Your mobile number").fill(number);
    await page.getByRole("button", { name: "Send me a code" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(copy);
    await expect(page.getByLabel("6-digit code")).toHaveCount(0);
  });
}

test("a crafted next never leaves the platform", async ({ page }) => {
  await signInWithPhone(page, "07700 900403", { next: "//evil.example" });
  await expect(page).toHaveURL(/^http:\/\/localhost:3001\/platform$/);
});

test("signed-out visitors to the account page are sent to sign in, then on to the directory", async ({ page }) => {
  await page.goto("/platform/account");
  await expect(page).toHaveURL(/\/platform\/sign-in\?next=%2Fplatform$/);
});

test("the brand bar links to the account page", async ({ page }) => {
  await page.goto("/platform");
  await expect(page.getByRole("banner").getByRole("link", { name: "Account" })).toHaveAttribute(
    "href",
    "/platform/account",
  );
});
