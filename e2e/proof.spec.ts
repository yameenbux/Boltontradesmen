import { expect, test } from "@playwright/test";
import { signInAsGoogle } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

// Proof upload needs Supabase Storage, which only the CLI stack (CI) has. The local stack has no Storage, so this
// spec is skipped there; the stripping itself is unit-tested (tests/unit/proofs.test.ts).
test.skip(process.env.SUPABASE_CLI_STACK !== "1", "needs Supabase Storage (CI's Supabase CLI stack)");

test("a resident attaches a photo of the invoice; it is stored privately and the form shows it was sent", async ({
  page,
}) => {
  await signInAsGoogle(page, `jan@${E2E_EMAIL_DOMAIN}`, {
    first: "Jan",
    surname: "Price",
    next: "/p/e2e-tidy-vans/review",
  });
  const form = page.getByRole("form", { name: "Your review" });
  await form.getByLabel("When was the job?").selectOption({ index: 1 });
  await form
    .getByRole("group", { name: "Roughly how much was it?" })
    .getByRole("button", { name: "Under £250" })
    .click();
  await form
    .getByRole("group", { name: "Did they turn up when they said?" })
    .getByRole("button", { name: "Yes" })
    .click();
  await form.getByRole("group", { name: "Did they stick to the price?" }).getByRole("button", { name: "Yes" }).click();
  await form.getByRole("group", { name: "Quality of work" }).getByRole("button", { name: /^4\b/ }).click();
  await form
    .getByRole("group", { name: "Did they leave the place tidy?" })
    .getByRole("button", { name: "Yes" })
    .click();
  await form.getByRole("group", { name: "Would you use them again?" }).getByRole("button", { name: "Yes" }).click();
  await form.getByLabel(/Proof of the job/).setInputFiles("e2e/fixtures/proof-with-gps.jpg");
  await expect(form.getByText("proof-with-gps.jpg")).toBeVisible();
  await page.getByRole("button", { name: "Post review" }).click();

  await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
  await expect(page.getByText(/the proof didn't upload/)).toHaveCount(0);

  // Opening the form again shows the proof is in, and offers no second upload.
  await page.goto("/p/e2e-tidy-vans/review");
  await expect(page.getByText("Proof sent")).toBeVisible();
  await expect(page.getByLabel(/Proof of the job/)).toHaveCount(0);

  // The account page lists the review with its proof state.
  await page.goto("/account");
  const item = page.getByRole("region", { name: "My reviews" }).getByRole("listitem").filter({ hasText: "Tidy Vans" });
  await expect(item).toContainText("Proof sent for checking");
});
