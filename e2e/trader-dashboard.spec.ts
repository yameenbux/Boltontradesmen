import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// The trader dashboard. Fixture (supabase/tests/fixtures/e2e.sql), all man & van: Dash Removals has 3 enquiries
// (2 this month: a call and a WhatsApp; 1 last month) and is linked, edited, paused and unpaused below; Gone Removals
// is linked and withdrawn; Tally Removals (unlinked) has 6, for the admin's view.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

const CATEGORY = "/c/man-and-van";
const card = (page: Page, name: string) => page.getByRole("link", { name: new RegExp(name) });
// The category page is ISR. Another spec's visit can start regenerating it just before a status change and store
// the older list just after the change's revalidation, so reload until the change shows (it always does at once
// when nothing else is rendering it).
async function categoryShows(page: Page, name: string, count: 0 | 1) {
  await expect(async () => {
    await page.goto(CATEGORY);
    await expect(card(page, "Keen Removals")).toBeVisible({ timeout: 1000 });
    await expect(card(page, name)).toHaveCount(count, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

// Links the listing to a new trader account with the admin's single-use link; returns the trader's page.
async function linkedTrader(page: Page, browser: Browser, testInfo: TestInfo, providerId: string, who: string) {
  await adminSignIn(page);
  await page.goto(`/admin/providers/${providerId}`);
  const signIn = page.getByRole("region", { name: "Trader sign-in" });
  await signIn.getByRole("button", { name: "Trader sign-in link" }).click();
  const path = new URL(await signIn.getByRole("textbox", { name: "Trader sign-in link" }).inputValue()).pathname;
  const trader = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await signInWithEmail(trader, `${who}-trader@${E2E_EMAIL_DOMAIN}`, { first: who, surname: "Trader", next: path });
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/provider$/);
  return trader;
}

test("a trader sees their enquiries, edits their listing, pauses and unpauses it", async ({ page, browser }, testInfo) => {
  const trader = await linkedTrader(page, browser, testInfo, "00000000-0000-0000-0000-00000000e217", "dash");

  // The sections, in order.
  const headings = await trader.locator("main h2").allTextContents();
  expect(headings.map((h) => h.replace(/\s*\d*\s*$/, ""))).toEqual([
    "Your page's look",
    "Enquiries",
    "Taking on work?",
    "Ask for reviews",
    "Share your page",
    "Put it on Google",
    "Your website badge",
    "Reviews",
    "Edit your listing",
  ]);

  const stats = trader.getByRole("region", { name: "Enquiries" });
  const strip = stats.getByTestId("stats-this-month");
  await expect(strip.locator(".stat")).toHaveText(["Enquiries2", "Calls1", "WhatsApps1", "Reviews0"]);
  await expect(stats.getByTestId("stats-all-time")).toHaveText("All time: 3 enquiries (2 calls, 1 WhatsApp)");
  const bars = stats.getByTestId("enquiry-chart").getByRole("listitem");
  await expect(bars).toHaveCount(6);
  await expect(bars.last()).toContainText(/: 2 enquiries \(1 call, 1 WhatsApp\)/);
  await expect(bars.nth(4)).toContainText(/: 1 enquiry \(1 call, 0 WhatsApps\)/);
  // Pro is offered from the start (no enquiries needed). Stripe isn't set up in E2E, so the quiet "Pro opens soon"
  // card, with nothing to buy.
  const soon = stats.getByTestId("pro-soon");
  await expect(soon).toContainText("Pro opens soon");
  await expect(soon).toContainText("£10 a month or £100 a year");
  await expect(soon.getByRole("link")).toHaveCount(0);
  await expect(soon.getByRole("button")).toHaveCount(0);
  await expect(stats.getByTestId("pro-upgrade")).toHaveCount(0);

  // The trader's own tap on their Call button doesn't count; someone else's does.
  const own = await trader.request.get("/api/contact/e2e-dash-vans?via=call", { maxRedirects: 0 });
  expect(own.status()).toBe(302);
  const stranger = await browser.newContext({ baseURL: testInfo.project.use.baseURL, userAgent: "E2E stranger" });
  expect((await stranger.request.get("/api/contact/e2e-dash-vans?via=whatsapp", { maxRedirects: 0 })).status()).toBe(302);
  await stranger.close();
  expect(sql(`select count(*) from public.contact_events where provider_id = '00000000-0000-0000-0000-00000000e217'
              and actor_id is not null`)).toBe("1");
  await trader.reload();
  await expect(strip.locator(".stat")).toHaveText(["Enquiries3", "Calls1", "WhatsApps2", "Reviews0"]);

  // Edit the bio and areas: refused with a phone number, then saved and on the public page.
  const edit = trader.getByRole("region", { name: "Edit your listing" });
  await expect(edit.getByText("Man & van, removals")).toBeVisible();
  const bio = edit.getByLabel("About your business");
  await expect(bio).toHaveValue("House moves across Bolton.");
  await bio.fill("Call 07700 900 317 for a quote");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByText("Please leave phone numbers out.", { exact: false })).toBeVisible();
  await bio.fill("Flat moves, house moves and single items. Blankets and straps on every job.");
  await edit.getByRole("checkbox", { name: "BL2" }).uncheck();
  await edit.getByRole("checkbox", { name: "BL3" }).check();
  await edit.getByRole("checkbox", { name: "M26" }).check();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("status")).toHaveText("Saved. It's on your page now.");
  expect(sql(`select array_to_string(areas, ',') || '|' || bio from public.providers where slug = 'e2e-dash-vans'`)).toBe(
    "BL3,M26|Flat moves, house moves and single items. Blankets and straps on every job.",
  );

  const visitor = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await visitor.goto("/p/e2e-dash-vans");
  await expect(visitor.getByRole("region", { name: "About" })).toContainText("Blankets and straps on every job.");
  await expect(visitor.locator(".prof-facts")).toContainText("BL3, M26");

  // Pause: a confirm dialog, then gone from the category list and the profile; reviews kept.
  await edit.getByRole("button", { name: "Pause my listing" }).click();
  const dialog = trader.getByRole("dialog", { name: "Pause your listing?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Yes, pause it" }).click();
  await expect(dialog).toBeHidden();
  await expect(edit.getByRole("button", { name: "Unpause my listing" })).toBeVisible();
  await expect(trader.getByText("Your listing is paused, so customers can't see it.")).toBeVisible();
  await categoryShows(visitor, "Dash Removals", 0);
  expect((await visitor.goto("/p/e2e-dash-vans"))?.status()).toBe(404);
  expect(sql(`select status || '/' || paused_by from public.providers where slug = 'e2e-dash-vans'`)).toBe("paused/trader");

  await edit.getByRole("button", { name: "Unpause my listing" }).click();
  await expect(edit.getByRole("button", { name: "Pause my listing" })).toBeVisible();
  await categoryShows(visitor, "Dash Removals", 1);
  expect(sql(`select string_agg(reason, ',' order by id) from public.audit_log
              where action = 'set_provider_status' and target_id = '00000000-0000-0000-0000-00000000e217'`)).toBe(
    "paused: Paused by trader,live: Unpaused by trader",
  );
});

test("a trader withdraws their listing after confirming", async ({ page, browser }, testInfo) => {
  const trader = await linkedTrader(page, browser, testInfo, "00000000-0000-0000-0000-00000000e218", "gone");
  const edit = trader.getByRole("region", { name: "Edit your listing" });

  // Cancel does nothing.
  await edit.getByRole("button", { name: "Withdraw my listing" }).click();
  const dialog = trader.getByRole("dialog", { name: "Withdraw your listing?" });
  await expect(dialog).toContainText("To be listed again you'd need a new invite from us");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(sql(`select status from public.providers where slug = 'e2e-gone-vans'`)).toBe("live");

  // Without the box ticked, it asks for it.
  await edit.getByRole("button", { name: "Withdraw my listing" }).click();
  await dialog.getByRole("button", { name: "Withdraw my listing" }).click();
  await expect(dialog.getByText("Tick the box to confirm you want to withdraw your listing.")).toBeVisible();
  expect(sql(`select status from public.providers where slug = 'e2e-gone-vans'`)).toBe("live");

  await dialog.getByRole("checkbox", { name: "I understand I can only come back with a new invite" }).check();
  await dialog.getByRole("button", { name: "Withdraw my listing" }).click();
  await expect(trader.getByRole("heading", { level: 1 })).toHaveText("Your listing is withdrawn");
  await expect(trader).toHaveURL(/\/provider\?withdrawn=1$/);

  expect(sql(`select status from public.providers where slug = 'e2e-gone-vans'`)).toBe("removed");
  expect(sql(`select reason from public.audit_log where action = 'set_provider_status'
              and target_id = '00000000-0000-0000-0000-00000000e218' order by id desc limit 1`)).toBe(
    "removed: Withdrawn by trader",
  );
  const visitor = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  expect((await visitor.goto("/p/e2e-gone-vans"))?.status()).toBe(404);
  await categoryShows(visitor, "Gone Removals", 0);

  // The admin sees it removed, and only Re-invite brings it back.
  await page.goto("/admin/providers/00000000-0000-0000-0000-00000000e218");
  await expect(page.getByTestId("provider-status")).toHaveText("removed");
});

test("the admin sees a listing's enquiries", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin/providers/00000000-0000-0000-0000-00000000e219");
  const stats = page.getByRole("region", { name: "Enquiries" });
  await expect(stats.getByTestId("stats-this-month").locator(".stat")).toHaveText([
    "Enquiries4",
    "Calls3",
    "WhatsApps1",
    "Reviews0",
  ]);
  await expect(stats.getByTestId("stats-all-time")).toHaveText("All time: 6 enquiries (5 calls, 1 WhatsApp)");
  await expect(stats.getByTestId("enquiry-chart").getByRole("listitem").nth(3)).toContainText(": 2 enquiries (2 calls, 0 WhatsApps)");
  // The admin's copy has no Pro offer in it.
  await expect(stats.getByTestId("pro-soon")).toHaveCount(0);
  // No phone digits leak into the stats.
  expect(await stats.textContent()).not.toMatch(/7700/);
});
