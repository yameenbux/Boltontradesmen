import { expect, type Page } from "@playwright/test";

// Test numbers accepted by the local stack and CI with the code 123456 (supabase/config.toml [auth.sms.test_otp]).
export const TEST_OTP = "123456";

type Options = { first?: string; surname?: string; district?: string; next?: string; intent?: "customer" | "trader" };

/**
 * Signs in on /platform/sign-in with a test number and code 123456. If Welcome appears (no profile yet),
 * completes it with the given names and area (BL1 by default). Ends wherever the app sends the person next.
 */
export async function signInWithPhone(page: Page, phone: string, opts: Options = {}) {
  const url = opts.next ? `/platform/sign-in?next=${encodeURIComponent(opts.next)}` : "/platform/sign-in";
  await page.goto(url);
  await page.getByLabel("Your mobile number").fill(phone);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByText(/We've sent a 6-digit code to/)).toBeVisible();
  await page.getByLabel("6-digit code").fill(TEST_OTP);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/platform/sign-in"));
  if (new URL(page.url()).pathname === "/platform/welcome") {
    await page.getByLabel("First name").fill(opts.first ?? "Test");
    await page.getByLabel("Surname").fill(opts.surname ?? "Resident");
    await page.getByLabel("Your area").selectOption(opts.district ?? "BL1");
    // Asked only when the sign-in had no particular destination.
    const intent = page.getByRole("radio", { name: opts.intent === "trader" ? /I'm a trader/ : /looking for a trader/ });
    if (await intent.count()) await intent.check();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await page.waitForURL((u) => u.pathname !== "/platform/welcome");
  }
}
