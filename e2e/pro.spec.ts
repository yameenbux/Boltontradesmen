import { execFileSync } from "node:child_process";
import Stripe from "stripe";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

// Pro. E2E has no Stripe keys, so the offer says "Pro opens soon"; the subscription is written as the webhook would
// (public.stripe_apply_event, the service role's function), and Pro's end arrives as a signed webhook event
// (playwright.config.ts gives the server a local-only STRIPE_WEBHOOK_SECRET, which alone doesn't open Pro).
// Fixture (supabase/tests/fixtures/e2e.sql): Lift Removals, man & van, unlinked, 5 enquiries.
// Uploads need Storage: the CLI stack's, or the local stack's stand-in (scripts/local-stack/storage.mjs).
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

const PROVIDER = "00000000-0000-0000-0000-00000000e220";
const PROFILE = "/platform/p/e2e-lift-vans";
const PHOTO = "e2e/fixtures/proof-with-gps.jpg";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

test.describe.configure({ mode: "serial" });

async function adminSignIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}

async function linkedTrader(page: Page, browser: Browser, testInfo: TestInfo) {
  await adminSignIn(page);
  await page.goto(`/admin/providers/${PROVIDER}`);
  const signIn = page.getByRole("region", { name: "Trader sign-in" });
  await signIn.getByRole("button", { name: "Trader sign-in link" }).click();
  const path = new URL(await signIn.getByRole("textbox", { name: "Trader sign-in link" }).inputValue()).pathname;
  const trader = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await signInWithEmail(trader, `lift-trader@${E2E_EMAIL_DOMAIN}`, { first: "Pip", surname: "Lift", next: path });
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/platform\/provider$/);
  return trader;
}

// A webhook event signed with the server's secret, as Stripe would send it.
function signedEvent(type: string, object: Record<string, unknown>, id: string) {
  const payload = JSON.stringify({ id, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } });
  const signature = new Stripe("sk_test_unused").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, signature };
}

const SUBSCRIPTION = (status: string) => ({
  id: "sub_e2elift",
  object: "subscription",
  customer: "cus_e2elift",
  status,
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: { provider_id: PROVIDER },
  items: {
    data: [{ price: { id: "price_e2e", recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 86400 * 20 }],
  },
});

test("Pro: opens soon without Stripe; then the ID check, a work photo, the public page, and the lapse", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!WEBHOOK_SECRET, "the server needs STRIPE_WEBHOOK_SECRET (playwright.config.ts sets a local one)");
  const trader = await linkedTrader(page, browser, testInfo);

  // 5 enquiries and no Stripe: the quiet card, nothing to buy, and no Pro panel.
  const stats = trader.getByRole("region", { name: "Enquiries" });
  await expect(stats.getByTestId("pro-soon")).toContainText("Pro opens soon");
  await expect(stats.getByTestId("pro-soon").getByRole("button")).toHaveCount(0);
  await expect(trader.getByRole("region", { name: "Pro", exact: true })).toHaveCount(0);

  // A subscription arrives (as the webhook writes it).
  sql(`select public.stripe_apply_event('evt_e2e_lift_1', 'checkout.session.completed', jsonb_build_object(
         'provider_id', '${PROVIDER}', 'customer', 'cus_e2elift', 'subscription', 'sub_e2elift', 'plan', 'monthly',
         'status', 'active', 'current_period_end', now() + interval '20 days', 'cancel_at_period_end', false,
         'as_of', now() - interval '1 minute'))`);
  await trader.reload();
  const pro = trader.getByRole("region", { name: "Pro", exact: true });
  await expect(pro.getByTestId("pro-status")).toContainText("Pro is on (£10 a month). It renews on");
  await expect(stats.getByTestId("pro-progress")).toHaveCount(0);
  // Stripe isn't set up, so there's no billing portal to open.
  await expect(pro.getByRole("button", { name: "Manage billing" })).toHaveCount(0);

  // The photo ID, stored privately.
  const idCheck = pro.getByRole("region", { name: "ID check" });
  await expect(idCheck.getByLabel("What are you sending?")).toHaveValue("photo_id");
  await idCheck.getByLabel("Photo or PDF").setInputFiles(PHOTO);
  await idCheck.getByRole("button", { name: "Send for checking" }).click();
  await expect(idCheck.getByRole("status")).toContainText("We'll check your ID");
  await expect(idCheck.getByTestId("id-status")).toContainText("we're checking it");

  // A work photo, published without its GPS.
  const photos = pro.getByRole("region", { name: /Work photos/ });
  await photos.getByLabel("Add a photo").setInputFiles(PHOTO);
  await photos.getByRole("button", { name: "Add to my page" }).click();
  await expect(photos.getByRole("status")).toHaveText("Added. It's on your page now.");
  await expect(photos.getByRole("listitem")).toHaveCount(1);
  const path = sql(`select storage_path from public.work_photos where provider_id = '${PROVIDER}' and removed_at is null`);
  expect(path).toMatch(new RegExp(`^${PROVIDER}/[0-9a-f-]{36}\\.webp$`));

  // Before the admin approves: the photo shows, the ID checked mark doesn't.
  const visitor = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await visitor.goto(PROFILE);
  await expect(visitor.locator(".prof-head")).not.toContainText("ID checked");

  // The admin's Pro page: the ID waiting, shown through a short-lived link; approve.
  await page.goto("/admin/pro");
  const doc = page.getByRole("article", { name: "Photo ID from Lift Removals" });
  await expect(doc.getByRole("img", { name: "Photo ID sent by Lift Removals" })).toBeVisible();
  await doc.getByRole("button", { name: "Approve: ID checked" }).click();
  // Decided, it leaves the queue.
  await expect(page.getByText("No documents waiting.")).toBeVisible();
  await expect(page.getByTestId("pro-traders")).toContainText("Lift Removals");
  await expect(page.getByTestId("pro-traders")).toContainText("ID checked · 1 photo");
  expect(sql(`select count(*) from public.audit_log where action in ('view_pro_document', 'pro_document_approved')
              and target_id in ('${PROVIDER}', (select id::text from public.pro_documents where provider_id = '${PROVIDER}'))`)).toBe("2");
  await page.goto(`/admin/providers/${PROVIDER}`);
  await expect(page.getByTestId("pro-state")).toHaveText("Pro on");

  // The public page: "ID checked" and the photo; never the word Pro, never a price.
  await visitor.goto(PROFILE);
  const head = visitor.locator(".prof-head");
  await expect(head.getByText("ID checked")).toBeVisible();
  await expect(head.getByRole("link", { name: /ID checked/ })).toHaveAttribute("title", "We've checked this trader's photo ID");
  await expect(visitor.getByRole("region", { name: "What we've checked" })).toContainText("We've checked this trader's photo ID");
  const gallery = visitor.getByRole("region", { name: "Their work" });
  const img = gallery.getByRole("img", { name: "Work by Lift Removals" });
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute("loading", "lazy");
  const src = (await img.getAttribute("src")) ?? "";
  expect(src).toContain(`/storage/v1/object/public/work-photos/${path}`);
  const file = await visitor.request.get(src);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("image/webp");
  expect((await file.body()).includes(Buffer.from("GPS"))).toBe(false);
  const text = (await visitor.locator("main").textContent()) ?? "";
  expect(text).not.toMatch(/\bPro\b|£10|subscription/);
  expect(text).not.toMatch(/7700/);

  // The webhook refuses a bad signature.
  const bad = await visitor.request.post("/api/stripe/webhook", {
    data: '{"id":"evt_x"}',
    headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" },
  });
  expect(bad.status()).toBe(400);

  // Stripe ends the subscription: the mark and the photos go; the listing stays.
  const { payload, signature } = signedEvent("customer.subscription.deleted", SUBSCRIPTION("canceled"), "evt_e2e_lift_end");
  const ended = await visitor.request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
  expect(ended.status()).toBe(200);
  expect(await ended.json()).toEqual({ received: true, outcome: "applied" });
  // Sent again: handled once.
  const again = await visitor.request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
  expect(await again.json()).toEqual({ received: true, outcome: "duplicate" });

  await visitor.goto(PROFILE);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Lift Removals");
  await expect(visitor.locator(".prof-head")).not.toContainText("ID checked");
  await expect(visitor.getByRole("region", { name: "Their work" })).toHaveCount(0);

  // The trader sees it ended; the photo is hidden but can still be removed (its file goes too).
  await trader.reload();
  await expect(pro.getByTestId("pro-status")).toContainText("Pro has ended");
  await expect(photos.getByText("Hidden from your page while Pro is off.")).toBeVisible();
  await expect(photos.getByRole("button", { name: "Add to my page" })).toHaveCount(0);
  await photos.getByRole("button", { name: "Remove photo 1" }).click();
  await expect(photos.getByText("No photos yet.")).toBeVisible();
  expect((await visitor.request.get(src)).status()).not.toBe(200);
});
