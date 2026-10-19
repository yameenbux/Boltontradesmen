import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

// Linking a listing and replying is in trader-link.spec.ts (a listing can only be linked once per run).

test("someone with no listing sees how to find theirs", async ({ page }) => {
  await signInWithEmail(page, `val@${E2E_EMAIL_DOMAIN}`, { first: "Val", surname: "Moor", next: "/platform/provider" });
  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp us" })).toHaveAttribute("href", /^https:\/\/wa\.me\/447466487591\?text=/);
});

test("a resident reports a review; the admin sees it under Flags", async ({ page }) => {
  await page.goto("/platform/p/e2e-ace-plumbing");
  await page.getByRole("article", { name: "Review by Jo B." }).getByRole("link", { name: "Report" }).click();
  await expect(page).toHaveURL(/\/platform\/sign-in\?next=%2Fplatform%2Freport%2F/);
  await expect(page.getByRole("heading", { name: "Sign in to report a review" })).toBeVisible();
  const next = new URL(page.url()).searchParams.get("next")!;
  await signInWithEmail(page, `gail@${E2E_EMAIL_DOMAIN}`, { first: "Gail", surname: "Ross", next });
  await expect(page).toHaveURL(new RegExp(`${next}$`));

  await expect(page.getByText("New radiator in the back bedroom. Tidy, polite and quick.")).toBeVisible();
  // An empty report is stopped by the browser (required); the server still refuses one on its own.
  await page.getByRole("button", { name: "Send report" }).click();
  const box = page.getByLabel("What's wrong with this review?");
  expect(await box.evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing)).toBe(true);
  await expect(page).toHaveURL(new RegExp(`${next}$`));
  const note = `Jo is the owner's brother ${Date.now()}`;
  await page.getByLabel("What's wrong with this review?").fill(note);
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(
    page.getByText("Thanks. We'll look at this review. Reports don't change a review on their own."),
  ).toBeVisible();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
  await page.goto("/admin/flags");
  const flag = page.getByRole("article").filter({ hasText: note });
  await expect(flag).toContainText("user_report");
  await expect(flag).toContainText("Gail R.");
});
