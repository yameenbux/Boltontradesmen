import { expect, test } from "@playwright/test";
import { signInAsGoogle, signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { signInWithPhone } from "./helpers/phone";
import { answer } from "./helpers/review";

// Every E2E reviewer posts from the same device (127.0.0.1, same browser), and a shared device flags both reviews.
// So each spec that expects "Published" reviews a provider no other spec posts a review for.

test("a resident posts a review, sees it on the profile, then edits it", async ({ page }) => {
  {
    await signInWithPhone(page, "07700 900402", {
      first: "Dana",
      surname: "Evans",
      next: "/platform/p/e2e-calm-carpentry/review",
    });
    await expect(page).toHaveURL(/\/platform\/p\/e2e-calm-carpentry\/review$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Calm Carpentry");
    await expect(page.getByText("Be honest — mixed jobs are useful too.")).toBeVisible();
    await answer(page, { quality: "4", comment: "Fitted new skirting in the hall. Neat work and fair price." });
    await expect(page.getByText("58/400")).toBeVisible();
    await page.getByRole("button", { name: "Post review" }).click();

    await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Back to Calm Carpentry/ }).click();
    await expect(page).toHaveURL(/\/platform\/p\/e2e-calm-carpentry$/);
    const review = page.getByRole("article", { name: "Review by Dana E." });
    await expect(review).toContainText("Fitted new skirting in the hall. Neat work and fair price.");
  }
  {
    // Editing: the same person opens the form again (still signed in) and sees their answers.
    await page.goto("/platform/p/e2e-calm-carpentry/review");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
    const form = page.getByRole("form", { name: "Your review" });
    await expect(form.getByLabel(/Anything to add/)).toHaveValue(
      "Fitted new skirting in the hall. Neat work and fair price.",
    );
    await expect(
      form.getByRole("group", { name: "Quality of work" }).getByRole("button", { name: /^4\b/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await form
      .getByLabel(/Anything to add/)
      .fill("Fitted new skirting in the hall. Neat work, fair price, left it spotless.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
  }
});

test("a 5-star first review from a brand-new account goes under a quick check", async ({ page }) => {
  await signInWithPhone(page, "07700 900403", {
    first: "Lee",
    surname: "Moss",
    next: "/platform/p/e2e-neat-sparks/review",
  });
  await answer(page, { quality: "5", comment: "New fuse board and lights. Brilliant." });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("heading", { name: "Published, under a quick check" })).toBeVisible();

  await page.goto("/platform/p/e2e-neat-sparks");
  const review = page.getByRole("article").filter({ hasText: "New fuse board and lights. Brilliant." });
  await expect(review.getByText("Under check", { exact: true })).toBeVisible();
});

test("the draft survives signing in and a reload, and is cleared after posting", async ({ page }) => {
  const path = "/platform/p/e2e-fresh-pipes/review";
  await page.goto(path);
  await expect(page).toHaveURL(/\/platform\/sign-in\?next=%2Fplatform%2Fp%2Fe2e-fresh-pipes%2Freview$/);
  await expect(page.getByRole("heading", { name: "Sign in to leave a review" })).toBeVisible();
  await signInWithPhone(page, "07700 900407", { first: "Rob", surname: "Hart", next: path });
  await expect(page).toHaveURL(new RegExp(`${path}$`));

  const comment = page.getByLabel(/Anything to add/);
  await comment.fill("Sorted a dripping tap.");
  await page.getByRole("group", { name: "Quality of work" }).getByRole("button", { name: /^3\b/ }).click();
  await page.reload();
  await expect(page.getByLabel(/Anything to add/)).toHaveValue("Sorted a dripping tap.");
  await expect(
    page.getByRole("group", { name: "Quality of work" }).getByRole("button", { name: /^3\b/ }),
  ).toHaveAttribute("aria-pressed", "true");

  await answer(page, { quality: "3" });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bv-review-draft:e2e-fresh-pipes"))).toBeNull();
});

test("missing answers are marked, and a phone number in the comment is refused", async ({ page }) => {
  await signInWithPhone(page, "07700 900408", { first: "Mo", surname: "Ali", next: "/platform/p/e2e-half-way/review" });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("alert").first()).toContainText("A few answers are missing");
  await expect(page.getByText("Choose how much it roughly cost.")).toBeVisible();

  await answer(page, { quality: "3", comment: "Good job, ring him on 07700 900 123" });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Please leave phone numbers out of your review.").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Published/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Post review" })).toBeVisible();
});

// Plan 2b: reviews by email-only accounts wait for the admin; Google accounts publish as before.
const HELD = "Waiting for a quick check — it'll appear once approved";

test("an email-code resident's review waits for a quick check and isn't on the profile yet", async ({ page }) => {
  await signInWithEmail(page, `held-ace@${E2E_EMAIL_DOMAIN}`, {
    first: "Hana",
    surname: "Reed",
    next: "/platform/p/e2e-ace-plumbing/review",
  });
  await answer(page, { quality: "4", comment: "Sorted a dripping kitchen tap in no time." });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("heading", { name: HELD })).toBeVisible();

  await page.goto("/platform/p/e2e-ace-plumbing");
  await expect(page.getByText("Sorted a dripping kitchen tap in no time.")).toHaveCount(0);

  await page.goto("/platform/account");
  const mine = page.getByRole("region", { name: /^My reviews/ });
  await expect(mine.getByRole("listitem").filter({ hasText: "Ace Plumbing" })).toContainText(HELD);
});

test("a Google resident's review is published straight away", async ({ page }) => {
  await signInAsGoogle(page, `google-birch@${E2E_EMAIL_DOMAIN}`, {
    first: "Gail",
    surname: "Moor",
    next: "/platform/p/e2e-birch-joinery/review",
  });
  await expect(page).toHaveURL(/\/platform\/p\/e2e-birch-joinery\/review$/);
  await answer(page, { quality: "4", comment: "Built a lovely set of alcove shelves." });
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
  await page.goto("/platform/p/e2e-birch-joinery");
  await expect(page.getByText("Built a lovely set of alcove shelves.")).toBeVisible();
});
