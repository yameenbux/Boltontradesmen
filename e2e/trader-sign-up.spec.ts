import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

// One account works for both; a trader who signs up is sent to the trader start, never left on the directory.

test("a trader who signs up says so and lands on the trader start", async ({ page }) => {
  await signInWithEmail(page, `new-trader@${E2E_EMAIL_DOMAIN}`, { first: "Tom", surname: "Trades", intent: "trader" });
  await expect(page).toHaveURL(/\/platform\/provider$/);
  await expect(page.getByRole("heading", { name: "Let's get your business on Bolton Vouched" })).toBeVisible();
  await expect(page.getByTestId("trader-start-get-listed")).toHaveAttribute("href", "/get-listed");
  await expect(page.getByTestId("trader-start-link")).toHaveAttribute("href", /^https:\/\/wa\.me\/447466487591\?text=/);

  // The account page offers the same way in.
  await page.goto("/platform/account");
  await page.getByTestId("account-trader-start").click();
  await expect(page).toHaveURL(/\/platform\/provider$/);
});

test("the trader sign-in skips the question and goes to the trader start", async ({ page }) => {
  await page.goto("/platform/sign-in");
  await page.getByTestId("trader-sign-in").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trader sign in");
  await expect(page.getByTestId("trader-sign-in")).toHaveAttribute("aria-current", "page");

  await signInWithEmail(page, `trader-door@${E2E_EMAIL_DOMAIN}`, { first: "Dee", surname: "Door", next: "/platform/provider" });
  await expect(page).toHaveURL(/\/platform\/provider$/);
  await expect(page.getByRole("heading", { name: "Let's get your business on Bolton Vouched" })).toBeVisible();
});

test("a sign-in with a set destination shows no customer-or-trader switch", async ({ page }) => {
  await page.goto(`/platform/sign-in?next=${encodeURIComponent("/platform/ask/new")}`);
  await expect(page.getByTestId("trader-sign-in")).toHaveCount(0);
});
