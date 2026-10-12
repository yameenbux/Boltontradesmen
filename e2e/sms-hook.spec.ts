import { expect, test } from "@playwright/test";

// Final review I1. The local stack points Supabase's Send SMS hook at /api/auth/sms-hook (scripts/local-stack/
// start.sh), so every text for a number that is not a test number goes through the app, which sends it only
// for a request its sign-in gate approved. CI's Supabase CLI stack has no hook, so this spec runs locally only.
// 07700 900410 is a drama number but not a test-OTP number: the hook "sends" to it with TWILIO_SMS_STUB=1.
test.skip(process.env.SUPABASE_CLI_STACK === "1", "the Send SMS hook is configured on the local stack only");

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

test("the sign-in page's text goes out through the hook, and Supabase can't be asked to text the account directly", async ({
  page,
  request,
}) => {
  await page.goto("/platform/sign-in");
  await page.getByLabel("Your mobile number").fill("07700 900410");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByText("We've sent a 6-digit code to 07700 900410")).toBeVisible();

  // The account now exists. Wait out Supabase's per-number resend interval (5s locally) so a refusal below
  // can only come from the hook, then ask Supabase for a code directly, as a script with the anon key could.
  await page.waitForTimeout(6000);
  const res = await request.post(`${API_URL}/auth/v1/otp`, {
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    data: { phone: "+447700900410" },
  });
  expect(res.status(), await res.text()).not.toBe(429);
  expect(res.ok()).toBe(false);

  // Through the sign-in page it still works: a new gate approval means one more text.
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("We've sent you a new code.");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
