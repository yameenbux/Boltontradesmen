import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// One account works for both. A trader picks "I'm a trader" on the sign-in page, logs in or creates the account there,
// then fills in one form (ticks their trades and areas, mobile and WhatsApp, Free or Pro) and presses Confirm: the
// listing goes live straight away, linked to the account, and they see "you're now live". The admin sees it first in
// Providers, marked "New, check me", until they press Checked.

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (q: string) =>
  execFileSync("psql", [DB_URL, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();

// Requests are limited per connection: each test sends its own (local only: no proxy in front, so this is trusted).
const ip = (n: number) => ({ "x-forwarded-for": `203.0.113.${n}` });
// A fresh mobile per run in the drama range (requests are limited per number too).
const mobile = () => `07700 900${String(Date.now() % 1000).padStart(3, "0")}`;

test("a new trader: tick trades and areas, mobile and WhatsApp, Confirm, live; then the admin checks it", async ({ page, browser }, testInfo) => {
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
  // Trades by group, as ticks.
  await form.getByText("Home & trades", { exact: true }).click();
  await form.getByRole("checkbox", { name: "Plumber", exact: true }).check();
  // Nothing ticked for areas: the form says so and keeps what was filled in.
  await form.getByLabel(/^Mobile number/).fill(phone);
  await expect(form.getByRole("checkbox", { name: "Customers can WhatsApp me on this number" })).toBeChecked();
  await expect(form).toContainText("Quotes and invoices from your phone");
  await form.getByRole("radio", { name: /^Pro/ }).check();
  // The consent page's statement, word for word; no ticks to agree: pressing Confirm is the agreement.
  await expect(form).toContainText("People who've used you can review you");
  await expect(form.getByTestId("confirm-line")).toContainText("By pressing Confirm");
  await expect(form.getByTestId("confirm-line")).toContainText("I have read and agree to the terms and the privacy notice");
  await form.getByRole("button", { name: "Confirm" }).click();
  await expect(form).toContainText("Tick the postcode areas you cover");
  await expect(form.getByRole("radio", { name: /^Pro/ })).toBeChecked();
  await expect(form.getByLabel("Business name")).toHaveValue(business);
  await form.getByRole("checkbox", { name: "BL3" }).check();
  await form.getByRole("checkbox", { name: "BL4" }).check();
  await form.getByRole("button", { name: "Confirm" }).click();

  // The "you're now live" page.
  await expect(page).toHaveURL(/\/provider\/live$/);
  const live = page.getByTestId("you-are-live");
  await expect(live).toContainText(`${business} is now live on Bolton Vouched`);
  await expect(live.getByRole("link", { name: "Start Pro: pay by card" })).toBeVisible();
  await expect(live.getByRole("link", { name: "Share your page on WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  const e164 = `+44${phone.replace(/\D/g, "").slice(1)}`;
  expect(
    sql(`select p.status || '|' || (p.user_id is not null) || '|' || (p.consent_evidence->>'via') || '|' || array_to_string(p.areas, ',')
           || '|' || c.slug || '|' || (p.whatsapp_e164 = '${e164}') || '|' || r.plan || '|' || r.status
         from public.providers p
         join public.provider_categories pc on pc.provider_id = p.id join public.categories c on c.id = pc.category_id
         join public.listing_requests r on r.business_name = p.business_name
         where p.business_name = '${business}'`),
  ).toBe("live|true|sign_up|BL3,BL4|plumber|true|pro|done");

  // The admin: first in Providers, marked New, check me, with how to reach them; Checked clears it.
  const admin = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await adminSignIn(admin);
  const row = admin.getByRole("link", { name: new RegExp(business) });
  await expect(row).toContainText("New, check me");
  await row.click();
  await expect(admin.getByTestId("new-listing")).toBeVisible();
  await expect(admin.getByTestId("trader-contact")).toContainText(email);
  await expect(admin.getByTestId("trader-contact").getByRole("link", { name: "WhatsApp" })).toBeVisible();
  await admin.getByRole("button", { name: "Checked" }).click();
  await expect(admin.getByTestId("new-listing")).toHaveCount(0);
  await admin.goto("/admin");
  await expect(admin.getByRole("link", { name: new RegExp(business) })).not.toContainText("New, check me");
});

test("a driving instructor gives their ADI badge number; the admin looks it up and lists them with one press", async ({ page, browser }, testInfo) => {
  await page.setExtraHTTPHeaders(ip(42));
  const email = `adi-trader-${Date.now()}@${E2E_EMAIL_DOMAIN}`;
  const business = `E2E Driving ${Date.now()}`;
  await signInWithEmail(page, email, { first: "Dee", surname: "Drive" });
  await page.goto("/provider");
  const form = page.getByTestId("trader-setup");
  await form.getByLabel("Business name").fill(business);
  const badge = form.getByRole("textbox", { name: "ADI badge number" });
  await expect(badge).toBeHidden();
  await form.getByText("Personal & lessons", { exact: true }).click();
  await form.getByRole("checkbox", { name: "Driving instructors" }).check();
  // Ticking the trade asks for the badge.
  await expect(badge).toBeVisible();
  await form.getByRole("checkbox", { name: "BL1" }).check();
  await form.getByLabel(/^Mobile number/).fill(`07700 900${String((Date.now() + 250) % 1000).padStart(3, "0")}`);
  await form.getByRole("radio", { name: /^Free/ }).check();
  await form.getByRole("button", { name: "Confirm" }).click();
  await expect(form).toContainText("Enter the number as it's shown on your card or badge");
  const expires = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  await form.getByRole("textbox", { name: "ADI badge number" }).fill("123456");
  await form.getByLabel("Badge expiry date").fill(expires);
  await form.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/provider\/live$/);

  // Live, but not under Driving instructors until the admin has looked the number up.
  const admin = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await adminSignIn(admin);
  const row = admin.getByRole("link", { name: new RegExp(business) });
  await expect(row).toContainText("Driving instructors (needs a check)");
  await row.click();
  const check = admin.getByTestId("signup-check-dvsa_adi");
  await expect(check).toContainText("ADI badge number: 123456");
  await check.getByRole("button", { name: "It checks out: add Driving instructors" }).click();
  await expect(admin.getByTestId("signup-check-dvsa_adi")).toHaveCount(0);
  expect(
    sql(`select k.reference || '|' || k.expires_on || '|' || c.slug from public.providers p
         join public.provider_checks k on k.provider_id = p.id and k.kind = 'dvsa_adi'
         join public.provider_categories pc on pc.provider_id = p.id join public.categories c on c.id = pc.category_id
         where p.business_name = '${business}'`),
  ).toBe(`123456|${expires}|driving-instructors`);
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
