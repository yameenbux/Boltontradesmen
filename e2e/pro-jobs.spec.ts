import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { signInAsGoogle, signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// Pro, part 2: founding Pro switched on in /admin, "Request a quote" on the trader's page, the trader's alerts (text
// and email, stubbed locally: the alert log shows them sent), the trader's job requests, and an Ask Bolton alert.
// Fixture (supabase/tests/fixtures/e2e.sql): Brook Removals, man & van in BL6 with a drama-range mobile. Other specs
// only read it (questions.spec recommends it), and nobody else asks for man & van in BL6.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

const BROOK = "00000000-0000-0000-0000-00000000e222";
// Letters only: ten or more digits in a row would read as a phone number.
const tag = () => Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6);

async function newPage(browser: Browser, testInfo: TestInfo) {
  return (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
}

// The alert (or customer message) rows for one item, as "channel:status", once the sender has marked them.
async function alertsFor(kind: string, like: string): Promise<string[]> {
  let rows: string[] = [];
  await expect(async () => {
    const out = sql(
      `select string_agg(n.channel || ':' || n.status, ',' order by n.channel) from public.notifications n
       where n.provider_id = '${BROOK}' and n.kind = '${kind}' and n.ref_id in (${like})`,
    );
    rows = out ? out.split(",") : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.endsWith(":queued"))).toBe(true);
  }).toPass({ timeout: 15_000 });
  return rows;
}

test("founding Pro: a resident requests a quote, the trader is alerted, sees it and marks it won", async ({
  page,
  browser,
}, testInfo) => {
  // The trader links their listing (so alert emails have an address), then the admin switches on founding Pro.
  await adminSignIn(page);
  await page.goto(`/admin/providers/${BROOK}`);
  const signIn = page.getByRole("region", { name: "Trader sign-in" });
  await signIn.getByRole("button", { name: "Trader sign-in link" }).click();
  const linkPath = new URL(await signIn.getByRole("textbox", { name: "Trader sign-in link" }).inputValue()).pathname;
  const trader = await newPage(browser, testInfo);
  await signInWithEmail(trader, `brook-trader@${E2E_EMAIL_DOMAIN}`, { first: "Bri", surname: "Brook", next: linkPath });
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/provider$/);
  await expect(trader.getByRole("heading", { name: /^Job requests/ })).toHaveCount(0);

  await page.goto(`/admin/providers/${BROOK}`);
  const pro = page.getByRole("region", { name: "Pro" });
  await expect(pro.getByTestId("grant-state")).toContainText("No founding Pro");
  await pro.getByRole("button", { name: "Switch on founding Pro" }).click();
  await expect(pro.getByRole("status")).toHaveText("Founding Pro is on");
  await page.reload();
  await expect(page.getByRole("region", { name: "Pro" }).getByTestId("grant-state")).toContainText(
    /^Free Pro until .* · Founding trader$/,
  );

  // The public page now offers "Request a quote" (ISR: revalidated on the grant; reload until it shows).
  const visitor = await newPage(browser, testInfo);
  await expect(async () => {
    await visitor.goto("/p/e2e-brook-vans");
    await expect(visitor.getByRole("region", { name: "Request a quote" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await visitor.getByRole("region", { name: "Request a quote" }).getByRole("link", { name: "Request a quote" }).click();
  await expect(visitor).toHaveURL(/\/p\/e2e-brook-vans\/request$/);

  const job = `Sofa and two boxes from BL6 to Chorley, Saturday morning ${tag()}`;
  const form = visitor.getByRole("form", { name: "Request a quote" });
  await form.getByLabel("The job").fill(job);
  await form.getByLabel("Where?").selectOption("BL6");
  await form.getByLabel("Your name").fill("Rosa Requester");
  await form.getByLabel("Your number").fill("07700 900341");
  await visitor.waitForTimeout(3500); // the form's minimum fill time
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(visitor).toHaveURL(/\/request\/sent$/);
  await expect(visitor.getByRole("heading", { name: "Request sent" })).toBeVisible();

  // The trader's text and email both went (stubbed locally), once each.
  const ids = `select id from public.job_requests where body = '${job}'`;
  expect(await alertsFor("job_request", ids)).toEqual(["email:sent", "sms:sent"]);

  // A second request from the same number to the same trader the same day is refused.
  await visitor.goto("/p/e2e-brook-vans/request");
  await form.getByLabel("The job").fill(`Another job please ${tag()}`);
  await form.getByLabel("Where?").selectOption("BL6");
  await form.getByLabel("Your name").fill("Rosa Requester");
  await form.getByLabel("Your number").fill("07700 900341");
  await visitor.waitForTimeout(3500);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByRole("alert")).toContainText("already sent this trader a request today");

  // The trader sees the request with one-tap Call, and marks it won.
  await trader.reload();
  const requests = trader.getByTestId("job-requests");
  const card = requests.getByRole("article", { name: "Request from Rosa Requester" });
  await expect(card).toContainText(job);
  await expect(card.getByRole("link", { name: "Call Rosa Requester on 07700 900341" })).toHaveAttribute(
    "href",
    "tel:+447700900341",
  );
  await expect(card.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/447700900341\?text=/);
  await card.getByLabel("Where it's up to").selectOption("won");
  await expect(async () => {
    expect(sql(`select status from public.job_requests where body = '${job}'`)).toBe("won");
  }).toPass({ timeout: 10_000 });

  // Alert settings: a number that isn't a mobile is refused; an email is saved.
  const alerts = trader.getByRole("form", { name: "Alert settings" });
  await alerts.getByLabel("Mobile for texts").fill("01204 555000");
  await alerts.getByRole("button", { name: "Save alert settings" }).click();
  await expect(alerts.getByText("Enter a UK mobile number")).toBeVisible();
  await alerts.getByLabel("Mobile for texts").fill("");
  await alerts.getByLabel("Email for alerts").fill(`brook-alerts@${E2E_EMAIL_DOMAIN}`);
  await alerts.getByRole("button", { name: "Save alert settings" }).click();
  await expect(alerts.getByRole("status")).toHaveText("Saved.");

  // Ask Bolton: a resident asks for a man & van in BL6, and Brook (Pro, covers BL6) is told.
  const asker = await newPage(browser, testInfo);
  await signInAsGoogle(asker, `pj-asker@${E2E_EMAIL_DOMAIN}`, { first: "Pia", surname: "Asker", next: "/ask/new?category=man-and-van" });
  const ask = asker.getByRole("form", { name: "Your question" });
  await expect(ask.getByLabel("Which trade?")).toHaveValue(/[0-9a-f-]{36}/);
  await ask.getByLabel("Where?").selectOption("BL6");
  const body = `Anyone know a man and van for a wardrobe in BL6? ${tag()}`;
  await ask.getByRole("textbox", { name: /^Your question/ }).fill(body);
  await ask.getByRole("button", { name: "Post question" }).click();
  await asker.waitForURL(/\/ask\/[0-9a-f-]{36}$/);
  expect(await alertsFor("question", `select id from public.questions where body = '${body}'`)).toEqual([
    "email:sent",
    "sms:sent",
  ]);
  expect(sql(`select to_addr from public.notifications where kind = 'question' and provider_id = '${BROOK}'
              and channel = 'email' and ref_id = (select id from public.questions where body = '${body}')`)).toBe(
    `brook-alerts@${E2E_EMAIL_DOMAIN}`,
  );

  // Quotes and invoices. Bank details first, so the invoice shows how to pay.
  await trader.goto("/provider");
  const bank = trader.getByRole("form", { name: "Bank details for invoices" });
  await bank.getByLabel("Name on the account").fill("Brook Removals");
  await bank.getByLabel("Sort code").fill("12-34-5");
  await bank.getByLabel("Account number").fill("12345678");
  await bank.getByRole("button", { name: "Save bank details" }).click();
  await expect(bank.getByText("Enter the 6-digit sort code")).toBeVisible();
  await bank.getByLabel("Sort code").fill("12-34-56");
  await bank.getByRole("button", { name: "Save bank details" }).click();
  await expect(bank.getByRole("status")).toHaveText("Saved. They'll show on your invoices.");

  // "Write a quote" from the job request: the customer's details come with it; the trader adds the prices.
  await trader.getByRole("article", { name: "Request from Rosa Requester" }).getByRole("link", { name: "Write a quote" }).click();
  const editor = trader.getByRole("form", { name: "Quote details" });
  await expect(editor.getByLabel("Customer's name")).toHaveValue("Rosa Requester");
  await expect(editor.getByLabel(/Their mobile/)).toHaveValue("07700 900341");
  await editor.getByRole("group", { name: "Line 1" }).getByLabel("Description").fill("Man and van, 3 hours");
  await editor.getByRole("group", { name: "Line 1" }).getByLabel("Qty").fill("3");
  await editor.getByRole("group", { name: "Line 1" }).getByLabel("Price (£)").fill("45");
  await editor.getByRole("button", { name: "+ Add a line" }).click();
  await editor.getByRole("group", { name: "Line 2" }).getByLabel("Description").fill("Fuel");
  await editor.getByRole("group", { name: "Line 2" }).getByLabel("Price (£)").fill("12.50");
  await expect(editor.getByText("Total £147.50")).toBeVisible();
  await editor.getByRole("button", { name: "Save quote" }).click();
  await expect(trader.getByRole("heading", { level: 1, name: /^Q-\d{4}$/ })).toBeVisible();
  await expect(trader.getByTestId("doc-total")).toHaveText("£147.50");

  // Sent on WhatsApp from the trader's own phone (a new tab), which marks the quote sent.
  const [wa] = await Promise.all([trader.waitForEvent("popup"), trader.getByRole("link", { name: "Send on WhatsApp" }).click()]);
  expect(wa.url()).toMatch(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//);
  await wa.close();
  const quoteId = new URL(trader.url()).pathname.split("/").pop()!;
  await expect(async () => {
    expect(sql(`select status from public.trade_docs where id = '${quoteId}'`)).toBe("sent");
  }).toPass({ timeout: 10_000 });

  // Unanswered after 3 days: the dashboard lists it to chase, with WhatsApp to the customer and the message ready.
  sql(`update public.trade_docs set sent_at = now() - interval '4 days' where id = '${quoteId}'`);
  await trader.goto("/provider");
  const chase = trader.getByTestId("chase-list");
  await expect(chase).toContainText("Rosa Requester");
  await expect(chase).toContainText("sent 4 days ago");
  const chaseLink = await chase.getByRole("link", { name: "Chase on WhatsApp" }).getAttribute("href");
  expect(chaseLink).toMatch(/^https:\/\/wa\.me\/447700900341\?text=Hi%20Rosa%2C%20just%20checking%20you%20got%20my%20quote%20Q-/);
  // The demand report shows with Pro.
  await expect(trader.getByTestId(/^demand-/)).toContainText("visits to Bolton's man & van, removals page");
  await trader.goBack();

  // The customer opens their copy (no sign-in) and accepts; the trader is told.
  const token = sql(`select token from public.trade_docs where id = '${quoteId}'`);
  const customer = await newPage(browser, testInfo);
  await customer.goto(`/d/${token}`);
  await expect(customer.getByTestId("doc-total")).toHaveText("£147.50");
  await expect(customer.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(customer.getByText("07700 900341")).toHaveCount(0);
  await customer.getByRole("button", { name: "Accept this quote" }).click();
  await expect(customer.getByRole("status")).toHaveText(/^(Accepted. We've let them know.|You accepted this quote. Brook Removals has been told.)$/);
  await customer.reload();
  await expect(customer.getByRole("button", { name: "Accept this quote" })).toHaveCount(0);
  expect(await alertsFor("quote_answered", `'${quoteId}'`)).toEqual(["email:sent", "sms:sent"]);

  // One tap to an invoice; the customer's copy shows how to pay.
  await trader.reload();
  await trader.getByRole("button", { name: "Turn into an invoice" }).click();
  await expect(trader.getByRole("heading", { level: 1, name: /^INV-\d{4}$/ })).toBeVisible();
  const invoiceId = new URL(trader.url()).pathname.split("/").pop()!;
  await customer.goto(`/d/${sql(`select token from public.trade_docs where id = '${invoiceId}'`)}`);
  const pay = customer.getByRole("region", { name: "How to pay" });
  await expect(pay).toContainText("12-34-56");
  await expect(pay).toContainText("12345678");
  await expect(pay).toContainText(/INV-\d{4}/);

  // Marked paid: the customer is asked for an honest review, by text (they gave no email), once.
  await trader.getByRole("button", { name: "Mark as paid" }).click();
  await expect(trader.getByRole("status")).toHaveText("Marked paid. We've asked them for a review.");
  expect(await alertsFor("review_request", `'${invoiceId}'`)).toEqual(["sms:sent"]);
  await expect(trader.getByTestId("doc-status")).toHaveText("Paid");
});

test("For traders: the free listing and Pro, side by side, linked from the site", async ({ page }) => {
  const res = await page.goto("/for-traders");
  expect(res?.headers()["set-cookie"]).toBeUndefined();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("More work from Bolton, without paying per lead");
  const free = page.getByRole("region", { name: "Free listing" });
  await expect(free).toContainText("no lead fees");
  const pro = page.getByRole("region", { name: "Pro" });
  await expect(pro).toContainText("£10 a month, or £100 a year");
  await expect(pro).toContainText("Quotes and invoices from your phone");
  await expect(pro.getByRole("link", { name: "Join as a trader with Pro" })).toHaveAttribute("href", "/sign-in?next=%2Fprovider");
  // Stripe isn't set up in E2E: nothing claims it can be bought today.
  await expect(pro.getByRole("link", { name: /Already listed\? Your listing/ })).toHaveAttribute("href", "/provider");
  await expect(page.getByRole("main")).toContainText("Pro never moves you up the list");

  await page.goto("/get-listed");
  await expect(page.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/for-traders");
  await page.goto("/terms");
  await expect(page.getByRole("main")).toContainText("Any listed trader can choose Pro");
});
