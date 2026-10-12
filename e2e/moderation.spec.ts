import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { answer } from "./helpers/review";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

// No count assertions: other specs create under-check reviews and reports in parallel.

async function adminSignIn(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}

test("the admin removes a review under check with a reason; it leaves the profile and is audited", async ({ page }) => {
  await page.goto("/platform/p/e2e-calm-carpentry");
  await expect(page.getByText("Hung three doors, all perfect.")).toBeVisible();

  await adminSignIn(page);
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: /^Reviews/ })
    .click();
  await expect(page.getByRole("heading", { name: "Reviews under check" })).toBeVisible();

  const card = page.getByRole("article").filter({ hasText: "Hung three doors, all perfect." });
  await expect(card).toContainText("Calm Carpentry");
  await expect(card).toContainText("burst_48h");
  await card.getByRole("button", { name: "Remove review" }).click();
  await expect(card.getByText("Enter a reason. It's kept in the audit log.")).toBeVisible();
  await card.getByLabel("Reason for removing").fill("Fake: same household as the provider");
  await card.getByRole("button", { name: "Remove review" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Hung three doors, all perfect." })).toHaveCount(0);

  await page.goto("/platform/p/e2e-calm-carpentry");
  await expect(page.getByText("Hung three doors, all perfect.")).toHaveCount(0);
  expect(
    sql(
      `select count(*) from audit_log where action = 'remove_review' and reason = 'Fake: same household as the provider'`,
    ),
  ).toBe("1");
});

test("the admin home shows the moderation counts and the nav", async ({ page }) => {
  await adminSignIn(page);
  const nav = page.getByRole("navigation", { name: "Admin" });
  for (const name of ["Providers", "Reviews", "Flags", "Proofs"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(
    page
      .getByRole("main")
      .getByText(/under check/)
      .first(),
  ).toBeVisible();
  await nav.getByRole("link", { name: /^Flags/ }).click();
  await expect(page.getByRole("heading", { name: "Flags" })).toBeVisible();
  await nav.getByRole("link", { name: /^Proofs/ }).click();
  await expect(page.getByRole("heading", { name: "Proofs to check" })).toBeVisible();
});

test("the admin can delete proof files checked over 12 months ago (none are due here)", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin/proofs");
  const old = page.getByRole("region", { name: "Old proof files" });
  await expect(old).toContainText("Proof files are deleted 12 months after you check them");
  await old.getByRole("button", { name: "Delete proof files due now" }).click();
  await expect(old.getByRole("status")).toHaveText("No proof files are due for deletion.");
});

test("held reviews: the admin approves one (it appears on the profile) and removes another with a reason", async ({
  page,
  browser,
}, testInfo) => {
  const HELD = "Waiting for a quick check — it'll appear once approved";
  const baseURL = testInfo.project.use.baseURL;
  // Two residents who signed in with an email code, on different devices (so the shared-device rule stays quiet).
  const residents = [
    { email: `held-oak-1@${E2E_EMAIL_DOMAIN}`, first: "Ann", comment: "Made us a solid oak gate that fits perfectly." },
    { email: `held-oak-2@${E2E_EMAIL_DOMAIN}`, first: "Ben", comment: "Buy cheap watches at my online shop today." },
  ];
  const pages = [];
  for (const [i, r] of residents.entries()) {
    const context = await browser.newContext({ baseURL, userAgent: `E2E held reviewer ${i + 1}` });
    const p = await context.newPage();
    await signInWithEmail(p, r.email, { first: r.first, surname: "Held", next: "/platform/p/e2e-oak-joinery/review" });
    await answer(p, { quality: "4", comment: r.comment });
    await p.getByRole("button", { name: "Post review" }).click();
    await expect(p.getByRole("heading", { name: HELD })).toBeVisible();
    pages.push(p);
  }

  await adminSignIn(page);
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: /^Reviews/ })
    .click();
  await expect(page.getByRole("heading", { name: "Reviews awaiting approval" })).toBeVisible();

  const good = page.getByRole("article").filter({ hasText: residents[0].comment });
  await expect(good).toContainText("Oak Joinery");
  await expect(good).toContainText("Signed in with an email code");
  await good.getByRole("button", { name: "Approve", exact: true }).click();
  // The queue refreshes: an approved review leaves it.
  await expect(good).toHaveCount(0);

  const spam = page.getByRole("article").filter({ hasText: residents[1].comment });
  await spam.getByLabel("Reason for removing").fill("Spam");
  await spam.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(spam).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("article").filter({ hasText: residents[0].comment })).toHaveCount(0);
  await expect(page.getByRole("article").filter({ hasText: residents[1].comment })).toHaveCount(0);
  expect(sql(`select count(*) from audit_log where action = 'approve_review'`)).not.toBe("0");
  expect(sql(`select count(*) from audit_log where action = 'remove_review' and reason = 'Spam'`)).toBe("1");

  await page.goto("/platform/p/e2e-oak-joinery");
  await expect(page.getByText(residents[0].comment)).toBeVisible();
  await expect(page.getByText(residents[1].comment)).toHaveCount(0);

  await pages[1].goto("/platform/account");
  await expect(pages[1].getByRole("region", { name: /^My reviews/ })).toContainText("Removed: Spam");
  for (const p of pages) await p.context().close();
});
