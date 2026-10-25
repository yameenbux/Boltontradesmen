import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// One account works for both. A trader picks "I'm a trader" on the sign-in page, logs in or creates the account there,
// then fills in one form (with Free or Pro) and agrees to the listing statement: the listing goes live straight away,
// linked to the account. The admin sees it first in Providers, marked "New, check me", until they press Checked.

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (q: string) =>
  execFileSync("psql", [DB_URL, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();

// Requests are limited per connection: each test sends its own (local only: no proxy in front, so this is trusted).
const ip = (n: number) => ({ "x-forwarded-for": `203.0.113.${n}` });
// A fresh mobile per run in the drama range (requests are limited per number too).
const mobile = () => `07700 900${String(Date.now() % 1000).padStart(3, "0")}`;

test("a new trader: one form with Pro, live straight away, then the admin checks it", async ({ page, browser }, testInfo) => {
  await page.setExtraHTTPHeaders(ip(41));
  await page.goto("/sign-in");
  await page.getByTestId("trader-sign-in").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in or join as a trader");
  await expect(page.getByTestId("trader-sign-in")).toHaveAttribute("aria-current", "page");

  const email = `new-trader-${Date.now()}@${E2E_EMAIL_DOMAIN}`;
  const business = `E2E Trader ${Date.now()}`;
  const phone = mobile();
  await signInWithEmail(page, email, { next: "/provider" });
  // No separate welcome step: straight to the one form, which asks the name too.
  await expect(page).toHaveURL(/\/provider$/);
  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
  const form = page.getByTestId("trader-setup");
  await form.getByLabel("First name").fill("Tom");
  await form.getByLabel("Surname").fill("Trades");
  await form.getByLabel("Business name").fill(business);
  await form.getByLabel(/Your trade/).fill("Plumber");
  await form.getByLabel("Where you're based").selectOption("BL3");
  await form.getByLabel(/Mobile number/).fill(phone);
  await expect(form).toContainText("Quotes and invoices from your phone");
  await expect(form).toContainText("Your listing goes live free now");
  await form.getByRole("radio", { name: /^Pro/ }).check();
  // The consent page's statement, word for word, and its agreement tick.
  await expect(form).toContainText("People who've used you can review you");
  await form.getByRole("checkbox", { name: /I'm the owner/ }).check();
  // Not without agreeing to the terms (the browser's required check is skipped to reach the server's).
  await form.evaluate((f) => f.setAttribute("novalidate", ""));
  await form.getByRole("button", { name: "Put my listing live" }).click();
  await expect(form).toContainText("Tick to agree to the terms and privacy notice");
  await form.getByRole("checkbox", { name: /I have read and agree to the terms/ }).check();
  await form.getByRole("button", { name: "Put my listing live" }).click();

  // Their listing page, live, with Pro on offer.
  await expect(page).toHaveURL(/\/provider\?live=1/);
  await expect(page.getByRole("heading", { name: business })).toBeVisible();
  await expect(page.getByTestId("you-are-live")).toBeVisible();
  expect(
    sql(`select p.status || '|' || (p.user_id is not null) || '|' || (p.consent_evidence->>'via') || '|' || array_to_string(p.areas, ',')
           || '|' || c.slug || '|' || r.plan || '|' || r.status
         from public.providers p
         join public.provider_categories pc on pc.provider_id = p.id join public.categories c on c.id = pc.category_id
         join public.listing_requests r on r.business_name = p.business_name
         where p.business_name = '${business}'`),
  ).toBe("live|true|sign_up|BL3|plumber|pro|done");

  // The admin: first in Providers, marked New, check me; Checked clears it.
  const admin = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await adminSignIn(admin);
  const row = admin.getByRole("link", { name: new RegExp(business) });
  await expect(row).toContainText("New, check me");
  await row.click();
  await expect(admin.getByTestId("new-listing")).toBeVisible();
  await admin.getByRole("button", { name: "Checked" }).click();
  await expect(admin.getByTestId("new-listing")).toHaveCount(0);
  await admin.goto("/admin");
  await expect(admin.getByRole("link", { name: new RegExp(business) })).not.toContainText("New, check me");
});

test("a listing the admin made for a trader's account goes live when they agree on their page", async ({ page }) => {
  const email = `agree-trader-${Date.now()}@${E2E_EMAIL_DOMAIN}`;
  const business = `E2E Agree ${Date.now()}`;
  await signInWithEmail(page, email, { first: "Ali", surname: "Agree" });
  // Its own number, away from the first test's (one listing per number).
  const e164 = `+447700900${String((Date.now() + 500) % 1000).padStart(3, "0")}`;
  sql(`insert into public.providers (slug, business_name, phone_e164, areas, status, user_id)
       select 'e2e-agree-${Date.now()}', '${business}', '${e164}', array['BL1'], 'invited', id from auth.users where email = '${email}'`);
  await page.goto("/provider");
  await expect(page.getByRole("heading", { name: business })).toBeVisible();
  const agree = page.getByTestId("agree-listing");
  await agree.getByRole("checkbox", { name: /I have read and agree to the terms/ }).check();
  await agree.getByRole("button", { name: "Put my listing live" }).click();
  await expect(page).toHaveURL(/\/provider\?live=1/);
  await expect(page.getByTestId("you-are-live")).toBeVisible();
  await expect(page.getByTestId("agree-listing")).toHaveCount(0);
  expect(sql(`select status || '|' || (consent_evidence->>'via') from public.providers where business_name = '${business}'`)).toBe(
    "live|listing_page",
  );
});

test("a customer: same sign-in page, says they're looking for a trader, lands on the directory", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in or create an account");
  await signInWithEmail(page, `new-customer-${Date.now()}@${E2E_EMAIL_DOMAIN}`, { first: "Cara", surname: "Lee" });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("greeting")).toHaveText(/Cara$/);
});

test("a customer account can still become a trader's: the account page offers the trader form", async ({ page }) => {
  await signInWithEmail(page, `later-trader-${Date.now()}@${E2E_EMAIL_DOMAIN}`, { first: "Wes", surname: "Lee" });
  await page.goto("/account");
  await page.getByTestId("account-trader-start").click();
  await expect(page).toHaveURL(/\/provider$/);
  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
  // The account already has a name: the form doesn't ask for it again.
  await expect(page.getByTestId("trader-setup").getByLabel("First name")).toHaveCount(0);
});

test("a sign-in with a set destination shows no customer-or-trader switch", async ({ page }) => {
  await page.goto(`/sign-in?next=${encodeURIComponent("/ask/new")}`);
  await expect(page.getByTestId("trader-sign-in")).toHaveCount(0);
});
