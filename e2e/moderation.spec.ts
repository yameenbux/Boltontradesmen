import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

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
