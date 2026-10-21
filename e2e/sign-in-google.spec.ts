import { expect, test } from "@playwright/test";

// CI has no Google: the local stack's Google provider uses a dummy client, and the request to Google is
// stopped at the door. This proves the app starts PKCE OAuth the right way, and that coming back from Google
// with an error lands on the sign-in page with plain copy.

test("Continue with Google starts PKCE OAuth with the local client and the Supabase callback", async ({ page, context }) => {
  await page.route("https://accounts.google.com/**", (r) => r.abort());
  await page.goto("/sign-in");
  const toGoogle = page.waitForRequest((r) => r.url().startsWith("https://accounts.google.com/"));
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const url = new URL((await toGoogle).url());
  expect(url.searchParams.get("client_id")).toBe("local-dummy.apps.googleusercontent.com");
  expect(url.searchParams.get("redirect_uri")).toMatch(/\/auth\/v1\/callback$/);
  expect(url.searchParams.get("prompt")).toBe("select_account");
  const cookies = await context.cookies("http://localhost:3000");
  expect(cookies.some((c) => /^sb-.+-code-verifier$/.test(c.name))).toBe(true);
});

test("coming back from Google with an error shows the Google copy on the sign-in page", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&next=/account");
  await expect(page).toHaveURL(/\/sign-in\?error=google&next=%2Faccount$/);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "We couldn't sign you in with Google. Please try again, or use an email code. If you've signed in with an email code before, use that.",
  );
});

test("the home-screen hint is in the page but hidden in a normal tab", async ({ page }) => {
  await page.goto("/sign-in");
  const hint = page.locator(".standalone-only");
  await expect(hint).toHaveText("Using the app from your home screen? The email code works without leaving the app.");
  await expect(hint).toBeHidden();
});

test("the Google button sits above the email form", async ({ page }) => {
  await page.goto("/sign-in");
  const google = await page.getByRole("button", { name: "Continue with Google" }).boundingBox();
  const email = await page.getByLabel("Your email address").boundingBox();
  expect(google!.y).toBeLessThan(email!.y);
  expect(google!.height).toBeGreaterThanOrEqual(48);
});
