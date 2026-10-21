import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { addDays, londonToday, shortDate } from "../lib/availability";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

// "Taking on work". Fixture (supabase/tests/fixtures/e2e.sql), all man & van: Keen Removals taking on work (set today),
// Busy Bee booked up for four weeks, Stale Removals' "taking on work" set 20 days ago (run out); Ready Removals is
// linked and set by its trader below, Swift Removals by the admin.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

const CATEGORY = "/c/man-and-van";
const card = (page: Page, name: string) => page.getByRole("link", { name: new RegExp(name) });

async function adminSignIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}

test("profiles and cards show availability; one that has run out shows nothing", async ({ page }) => {
  await page.goto("/p/e2e-keen-vans");
  const head = page.locator(".prof-head");
  await expect(head.getByTestId("availability")).toHaveText("Taking on work");
  await expect(head.getByText("· updated today")).toBeVisible();

  await page.goto("/p/e2e-busy-vans");
  const until = shortDate(addDays(londonToday(), 28));
  await expect(page.locator(".prof-head").getByTestId("availability")).toHaveText(`Booked up until ${until}`);
  await expect(page.locator(".prof-head").getByText("· updated 2 days ago")).toBeVisible();

  await page.goto("/p/e2e-stale-vans");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stale Removals");
  await expect(page.getByTestId("availability")).toHaveCount(0);
  await expect(page.getByText(/updated .* ago|Taking on work/)).toHaveCount(0);

  await page.goto(CATEGORY);
  await expect(card(page, "Keen Removals").getByTestId("availability")).toHaveText("Taking on work");
  await expect(card(page, "Busy Bee Removals").getByTestId("availability")).toHaveText(`Booked up until ${until}`);
  await expect(card(page, "Stale Removals")).toBeVisible();
  await expect(card(page, "Stale Removals").getByTestId("availability")).toHaveCount(0);
  // Nothing about it in the structured data.
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
  expect(ld).not.toMatch(/Taking on work|Booked up/);
});

test("the Taking on work chip shows only those taking on work, in the same order", async ({ page }) => {
  await page.goto(CATEGORY);
  const names = () => page.locator(".pcard .name").allTextContents();
  await expect(card(page, "Keen Removals")).toBeVisible();
  const before = await names();
  const chip = page.getByRole("button", { name: "Taking on work" });
  await expect(chip).toHaveAttribute("aria-pressed", "false");

  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, "Busy Bee Removals")).toHaveCount(0);
  await expect(card(page, "Stale Removals")).toHaveCount(0);
  await expect(card(page, "Card Removals")).toHaveCount(0);
  await expect(card(page, "Keen Removals")).toBeVisible();
  const after = await names();
  // Every card left says Taking on work (Ready or Swift may be, while the other tests run) and keeps its place.
  for (const name of after) {
    await expect(card(page, name).getByTestId("availability")).toContainText("Taking on work");
  }
  expect(before.filter((n) => after.includes(n))).toEqual(after);

  // Combined with an area: Keen covers BL3 only.
  await page.getByRole("button", { name: "BL1", exact: true }).click();
  await expect(card(page, "Keen Removals")).toHaveCount(0);
  await page.getByRole("button", { name: "BL3", exact: true }).click();
  await expect(card(page, "Keen Removals")).toBeVisible();

  await chip.click();
  await page.getByRole("button", { name: "All of Bolton" }).click();
  await expect(card(page, "Busy Bee Removals")).toBeVisible();
  await expect(card(page, "Stale Removals")).toBeVisible();
});

test("a linked trader sets Taking on work, then Booked up until a date", async ({ page, browser }, testInfo) => {
  // Link Ready Removals to a trader with the admin's single-use link.
  await adminSignIn(page);
  await page.goto("/admin/providers/00000000-0000-0000-0000-00000000e214");
  const signIn = page.getByRole("region", { name: "Trader sign-in" });
  await signIn.getByRole("button", { name: "Trader sign-in link" }).click();
  const path = new URL(await signIn.getByRole("textbox", { name: "Trader sign-in link" }).inputValue()).pathname;

  const trader = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await signInWithEmail(trader, `ready-trader@${E2E_EMAIL_DOMAIN}`, { first: "Rae", surname: "Ready", next: path });
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/provider$/);

  const form = trader.getByRole("region", { name: "Taking on work?" });
  await expect(form.getByTestId("availability-now")).toHaveText("Nothing shows now.");
  await expect(form.getByRole("radio", { name: "Don't show anything" })).toBeChecked();
  await form.getByRole("radio", { name: "Taking on work" }).check();
  await form.getByRole("button", { name: "Save availability" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved. It's on your page now.");
  await expect(form.getByTestId("availability-now")).toContainText("Your page shows: Taking on work · updated today");

  await trader.goto("/p/e2e-ready-vans");
  await expect(trader.locator(".prof-head").getByTestId("availability")).toHaveText("Taking on work");
  await expect(trader.locator(".prof-head").getByText("· updated today")).toBeVisible();
  await trader.goto(CATEGORY);
  await expect(card(trader, "Ready Removals").getByTestId("availability")).toHaveText("Taking on work");

  // Booked up until a date three weeks away.
  const until = addDays(londonToday(), 21);
  await trader.goto("/provider");
  await form.getByRole("radio", { name: "Booked up" }).check();
  const date = form.getByLabel("Booked up until");
  await expect(date).toHaveAttribute("min", addDays(londonToday(), 1));
  await date.fill(until);
  await form.getByRole("button", { name: "Save availability" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved. It's on your page now.");
  await expect(form.getByTestId("availability-now")).toContainText(`Booked up until ${shortDate(until)}`);

  await trader.goto("/p/e2e-ready-vans");
  await expect(trader.locator(".prof-head").getByTestId("availability")).toHaveText(`Booked up until ${shortDate(until)}`);
  await trader.goto(CATEGORY);
  await expect(card(trader, "Ready Removals").getByTestId("availability")).toHaveText(`Booked up until ${shortDate(until)}`);

  expect(sql(`select string_agg(reason, ',' order by id) from public.audit_log
              where action = 'set_availability' and target_id = '00000000-0000-0000-0000-00000000e214'`)).toBe(
    `taking,booked until ${until}`,
  );
});

test("the admin sets and clears a listing's availability", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin/providers/00000000-0000-0000-0000-00000000e215");
  const section = page.getByRole("region", { name: "Availability" });
  await expect(section.getByTestId("availability-now")).toHaveText("Nothing shows now.");

  await section.getByRole("radio", { name: "Taking on work" }).check();
  await section.getByRole("checkbox", { name: "Can start this week" }).check();
  await section.getByRole("button", { name: "Save availability" }).click();
  await expect(section.getByRole("status")).toHaveText("Availability saved");
  await expect(section.getByTestId("availability-now")).toContainText("Showing now: Taking on work this week · updated today");

  await page.goto("/p/e2e-swift-vans");
  await expect(page.locator(".prof-head").getByTestId("availability")).toHaveText("Taking on work this week");

  await page.goto("/admin/providers/00000000-0000-0000-0000-00000000e215");
  await section.getByRole("radio", { name: "Don't show anything" }).check();
  await section.getByRole("button", { name: "Save availability" }).click();
  await expect(section.getByRole("status")).toHaveText("Availability cleared");
  await expect(section.getByTestId("availability-now")).toHaveText("Nothing shows now.");

  await page.goto("/p/e2e-swift-vans");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Swift Removals");
  await expect(page.getByTestId("availability")).toHaveCount(0);

  expect(sql(`select count(*) from public.audit_log
              where action = 'admin_set_availability' and target_id = '00000000-0000-0000-0000-00000000e215'`)).toBe("2");
});

test("How ratings work says availability doesn't change the order", async ({ page }) => {
  await page.goto("/how-ratings-work");
  await expect(
    page.getByText(
      "“Taking on work” and “Booked up until” are set by the trader, run out by themselves (after 14 days, or on the date given) and don't change the order.",
    ),
  ).toBeVisible();
});
