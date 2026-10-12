import { expect, test } from "@playwright/test";
import { signInWithPhone } from "./helpers/phone";

test("a provider signs in with their listing's number, replies to a review, and can't review a rival", async ({
  page,
}) => {
  await signInWithPhone(page, "07700 900301", { first: "Alan", surname: "Ace" });
  await expect(page).toHaveURL(/\/platform\/account$/);
  await page.getByRole("link", { name: /Your listing/ }).click();
  await expect(page).toHaveURL(/\/platform\/provider$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ace Plumbing");
  for (const name of ["Pat P.", "Jo B.", "Sam T.", "Ali R."]) {
    await expect(page.getByRole("article", { name: `Review by ${name}` })).toBeVisible();
  }

  const pat = page.getByRole("article", { name: "Review by Pat P." });
  await pat.getByLabel("Your reply").fill("Thanks Pat, glad the boiler's behaving.");
  await expect(pat.getByText("39/400")).toBeVisible();
  await pat.getByRole("button", { name: "Post reply" }).click();
  await expect(pat.getByText("Reply posted")).toBeVisible();
  await expect(pat.getByRole("button", { name: "Edit reply" })).toBeVisible();

  await page.goto("/platform/p/e2e-ace-plumbing");
  const onProfile = page.getByRole("article", { name: "Review by Pat P." });
  await expect(onProfile.getByText("Reply from Ace Plumbing")).toBeVisible();
  await expect(onProfile).toContainText("Thanks Pat, glad the boiler's behaving.");

  await page.goto("/platform/p/e2e-fresh-pipes/review");
  await expect(page.getByText("You can't review someone who works in the same trade as you.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Your review" })).toHaveCount(0);
});

test("someone with no listing sees how to find theirs", async ({ page }) => {
  await signInWithPhone(page, "07700 900409", { first: "Val", surname: "Moor", next: "/platform/provider" });
  await expect(page.getByText(/We couldn't find a listing with this number/)).toBeVisible();
});

test("a resident reports a review; the admin sees it under Flags", async ({ page }) => {
  await page.goto("/platform/p/e2e-ace-plumbing");
  await page.getByRole("article", { name: "Review by Jo B." }).getByRole("link", { name: "Report" }).click();
  await expect(page).toHaveURL(/\/platform\/sign-in\?next=%2Fplatform%2Freport%2F/);
  await expect(page.getByRole("heading", { name: "Sign in to report a review" })).toBeVisible();
  const next = new URL(page.url()).searchParams.get("next")!;
  await signInWithPhone(page, "07700 900406", { first: "Gail", surname: "Ross", next });
  await expect(page).toHaveURL(new RegExp(`${next}$`));

  await expect(page.getByText("New radiator in the back bedroom. Tidy, polite and quick.")).toBeVisible();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Tell us what's wrong with it, in up to 500 characters.")).toBeVisible();
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
