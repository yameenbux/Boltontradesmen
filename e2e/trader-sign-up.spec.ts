import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// One account works for both. A trader picks "I'm a trader" on the sign-in page, logs in or creates the account there,
// then fills in one form (with Free or Pro) and sees "sent for review". The admin approves it onto the listing, which
// links the account.

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (q: string) =>
  execFileSync("psql", [DB_URL, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();

// Requests are limited per connection: each test sends its own (local only: no proxy in front, so this is trusted).
const ip = (n: number) => ({ "x-forwarded-for": `203.0.113.${n}` });
// A fresh mobile per run in the drama range (requests are limited per number too).
const mobile = () => `07700 900${String(Date.now() % 1000).padStart(3, "0")}`;

test("a new trader: trader side of sign-in, one form with Pro, sent for review, approved and linked", async ({ page, browser }, testInfo) => {
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
  await expect(form.getByRole("radio", { name: /^Pro/ })).toBeVisible();
  await expect(form).toContainText("Quotes and invoices from your phone");
  await expect(form).toContainText("You don't pay anything until your listing is approved");
  await form.getByRole("radio", { name: /^Pro/ }).check();
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Send for review" }).click();

  const sent = page.getByTestId("sent-for-review");
  await expect(sent).toContainText("Thanks, we've got your details");
  await expect(sent).toContainText(`${business} is with us for review`);
  await expect(page.getByRole("region", { name: "Your listing: Pro" })).toContainText("Nothing to pay yet");
  // It stays that way on the next visit.
  await page.reload();
  await expect(page.getByTestId("sent-for-review")).toBeVisible();
  expect(sql(`select plan || '|' || status from public.listing_requests where business_name = '${business}'`)).toBe("pro|new");

  // The admin creates the listing; once it's agreed to, Approve links it to the account and notifies the trader.
  const e164 = `+44${phone.replace(/\D/g, "").slice(1)}`;
  sql(`insert into public.providers (slug, business_name, phone_e164, areas, status, consent_at, consent_evidence)
       values ('e2e-trader-${Date.now()}', '${business}', '${e164}', array['BL3'], 'consented', now(), '{"source":"e2e"}'::jsonb)`);
  const admin = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await adminSignIn(admin);
  await admin.goto("/admin/requests");
  const card = admin.getByRole("article", { name: `Request from ${business}` });
  await expect(card).toContainText("Wants Pro");
  await expect(card).toContainText("Has an account");
  await card.getByRole("button", { name: /Approve and notify/ }).click();
  await expect(card.getByRole("status")).toContainText("Approved and linked. They've been told by email");

  // The trader's page is now their listing, with Pro on offer.
  await page.reload();
  await expect(page.getByRole("heading", { name: business })).toBeVisible();
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
