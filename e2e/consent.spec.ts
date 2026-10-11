import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sql(query: string): string {
  return execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();
}

test("provider consents via their link, then the admin sets them live", async ({ page, browser }) => {
  const name = `E2E Consent ${Date.now()}`;
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Add provider" }).click();
  await page.getByLabel("Business name").fill(name);
  await page.getByRole("textbox", { name: /^Phone/ }).fill("07700 900125");
  await page.getByRole("textbox", { name: /^Areas/ }).fill("BL1, BL2");
  await page.getByLabel("Plumber", { exact: true }).check();
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("invited");
  await expect(page.getByRole("button", { name: "Set live" })).toBeDisabled();

  const token = sql(`select consent_token from public.providers where business_name = '${name}'`);
  expect(token).toMatch(/^[0-9a-f-]{36}$/);

  // The provider has no account: a fresh browser context.
  const ctx = await browser.newContext();
  const consent = await ctx.newPage();
  await consent.goto(`/consent/${token}`);
  await expect(consent.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  await expect(consent.getByText("Plumber", { exact: true })).toBeVisible();
  await expect(consent.getByText("BL1, BL2")).toBeVisible();
  await expect(consent.getByText("Reviews are published without your approval", { exact: false })).toBeVisible();
  await expect(consent.getByText("within one working day", { exact: false })).toBeVisible();
  await expect(consent.getByText("Bolton Vouched is run by", { exact: false })).toBeVisible();
  await expect(consent.getByRole("link", { name: "Read the privacy notice" })).toHaveAttribute("href", "/privacy");
  await consent.getByRole("button", { name: "I agree" }).click();
  await expect(consent.getByText("Thanks — you're all set")).toBeVisible();

  await consent.goto(`/consent/${token}`);
  await expect(consent.getByText("This link is no longer valid").first()).toBeVisible();
  await ctx.close();

  expect(sql(`select consent_evidence->>'text_version' from public.providers where business_name = '${name}'`)).toBe("2026-10-11");

  await page.reload();
  await expect(page.getByTestId("provider-status")).toHaveText("consented");
  await expect(page.getByRole("button", { name: "New consent link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Set live" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("live");
});

test("garbage and unknown tokens show the invalid message", async ({ page }) => {
  await page.goto("/consent/not-a-token");
  await expect(page.getByText("This link is no longer valid").first()).toBeVisible();
  await page.goto("/consent/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("This link is no longer valid").first()).toBeVisible();
});
