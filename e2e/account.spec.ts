import { expect, test } from "@playwright/test";
import { signInAsGoogle } from "./helpers/email";
import { E2E_EMAIL_DOMAIN, latestCode } from "./helpers/mailbox";
import { answer } from "./helpers/review";

test("a resident sees their review under My reviews, deletes their account, and the review comes down", async ({
  page,
}) => {
  await signInAsGoogle(page, `del@${E2E_EMAIL_DOMAIN}`, {
    first: "Del",
    surname: "Morris",
    next: "/p/e2e-neat-sparks/review",
  });
  await expect(page).toHaveURL(/\/p\/e2e-neat-sparks\/review$/);
  await answer(page, { quality: "3", comment: "Swapped two sockets. Fine, a bit slow." });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("heading", { name: /^Published/ })).toBeVisible();

  await page.goto("/account");
  const mine = page.getByRole("region", { name: "My reviews" });
  const item = mine.getByRole("listitem").filter({ hasText: "Neat Sparks" });
  await expect(item).toBeVisible();
  await expect(item).toContainText(/Published/);
  await expect(item.getByRole("link", { name: /Edit/ })).toHaveAttribute(
    "href",
    "/p/e2e-neat-sparks/review",
  );

  // Deleting needs the box ticked.
  const del = page.getByRole("region", { name: "Delete account" });
  await del.getByText("I want to delete my account").click();
  await del.getByRole("button", { name: "Delete my account" }).click();
  await expect(del.getByText("Tick the box to confirm.")).toBeVisible();
  await del.getByLabel("I understand my reviews will be taken down").check();
  await del.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account\/deleted$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is deleted");

  await page.goto("/p/e2e-neat-sparks");
  await expect(page.getByText("Swapped two sockets. Fine, a bit slow.")).toHaveCount(0);

  // Signed out: the account page asks for sign-in, and the same address starts a fresh account.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Your email address").fill(`del@${E2E_EMAIL_DOMAIN}`);
  const sentAfter = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(await latestCode(`del@${E2E_EMAIL_DOMAIN}`, sentAfter));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome/);
});
