import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { answer } from "./helpers/review";

// Review request links and the printable QR card. Fixture: Card Removals (e2e-card-vans), live, no reviews, not linked.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

const SLUG = "e2e-card-vans";
const CARD_ADMIN = "/admin/providers/00000000-0000-0000-0000-00000000e210";
const LINK = `http://localhost:3000/r/${SLUG}`;

async function adminSignIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}

test("/r/<slug> is a permanent redirect to the review form, marked as from the card", async ({ request, page }) => {
  const res = await request.get(`/r/${SLUG}`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe(`/platform/p/${SLUG}/review?ref=card`);
  expect(res.headers()["set-cookie"]).toBeUndefined();

  // Signed out, it lands on sign-in, which comes back to the form with ref=card.
  await page.goto(`/r/${SLUG}`);
  await expect(page).toHaveURL(/\/platform\/sign-in\?next=%2Fplatform%2Fp%2Fe2e-card-vans%2Freview%3Fref%3Dcard$/);
});

test("a review that starts from the card is recorded as from the card, for the admin only", async ({
  browser,
  page,
}, testInfo) => {
  // No digits: a long number reads as a phone number and is refused.
  const comment = "Moved our piano down two flights without a scratch.";
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, userAgent: "E2E card reviewer" });
  const resident = await context.newPage();
  await resident.goto(`/r/${SLUG}`);
  const next = new URL(resident.url()).searchParams.get("next")!;
  expect(next).toBe(`/platform/p/${SLUG}/review?ref=card`);
  await signInWithEmail(resident, `card-review@${E2E_EMAIL_DOMAIN}`, { first: "Cora", surname: "Scan", next });
  await expect(resident).toHaveURL(/\/platform\/p\/e2e-card-vans\/review\?ref=card$/);
  await answer(resident, { quality: "3", comment });
  await resident.getByRole("button", { name: "Post review" }).click();
  // An email-code account's review waits for the admin.
  await expect(resident.getByRole("heading", { name: "Waiting for a quick check — it'll appear once approved" })).toBeVisible();
  const lit = comment.replace(/'/g, "''");
  expect(sql(`select source from public.reviews where comment = '${lit}'`)).toBe("card");

  // Not on the public profile or anywhere public.
  await resident.goto(`/platform/p/${SLUG}`);
  await expect(resident.getByText("via review card")).toHaveCount(0);

  await adminSignIn(page);
  await page.goto("/admin/reviews");
  const held = page.getByRole("article").filter({ hasText: comment });
  await expect(held).toContainText("Card Removals");
  await expect(held).toContainText("via review card");
  // Only reviews from the card carry the note (no count: other specs change the queues in parallel).
  expect(sql(`select count(*) from public.reviews where source = 'card' and comment <> '${lit}'`)).toBe("0");
});

test("a linked trader shares their review link and prints their card; the admin can print it too", async ({
  page,
  browser,
}, testInfo) => {
  await adminSignIn(page);
  await page.goto(CARD_ADMIN);

  // The admin's provider page: the link, Copy link, WhatsApp, and the card.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const requests = page.getByRole("region", { name: "Review requests" });
  await expect(requests.getByTestId("review-link")).toHaveText(`localhost:3000/r/${SLUG}`);
  await requests.getByRole("button", { name: "Copy link" }).click();
  await expect(requests.getByText("Link copied.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
  await requests.getByRole("link", { name: "Print a review card with a QR code" }).click();
  await expect(page).toHaveURL(new RegExp(`${CARD_ADMIN}/card$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Card Removals");
  await expect(page.getByRole("img", { name: `QR code for localhost:3000/r/${SLUG}` }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();

  // Link the listing to a trader with the admin's single-use link.
  await page.goto(CARD_ADMIN);
  const signIn = page.getByRole("region", { name: "Trader sign-in" });
  await signIn.getByRole("button", { name: "Trader sign-in link" }).click();
  const path = new URL(await signIn.getByRole("textbox", { name: "Trader sign-in link" }).inputValue()).pathname;

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const trader = await context.newPage();
  // The card page is for signed-in traders only.
  await trader.goto("/platform/provider/card");
  await expect(trader).toHaveURL(/\/platform\/sign-in\?next=%2Fplatform%2Fprovider%2Fcard$/);
  await signInWithEmail(trader, `card-trader@${E2E_EMAIL_DOMAIN}`, { first: "Cath", surname: "Card", next: path });
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/platform\/provider$/);

  const ask = trader.getByRole("region", { name: "Ask for reviews" });
  await expect(ask).toContainText("Ask every customer, not just the happy ones");
  await expect(ask.getByTestId("review-link")).toHaveText(`localhost:3000/r/${SLUG}`);
  await ask.getByRole("button", { name: "Copy link" }).click();
  expect(await trader.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
  const whatsapp = await ask.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(whatsapp!.split("?text=")[1])).toBe(
    `Thanks for choosing Card Removals. If you've a minute, please leave an honest review on Bolton Vouched: ${LINK}`,
  );

  await ask.getByRole("link", { name: "Print a review card with a QR code" }).click();
  await expect(trader).toHaveURL(/\/platform\/provider\/card$/);
  await expect(trader.getByRole("heading", { level: 1 })).toHaveText("Card Removals");
  await expect(
    trader.getByText("Ask every customer, not just the happy ones — that's the rule, and it's what makes your reviews count."),
  ).toBeVisible();
  const card = trader.getByRole("figure", { name: "Review card for Card Removals" });
  await expect(card.getByText("How did we do? Tell Bolton.")).toBeVisible();
  await expect(card.getByText(`localhost:3000/r/${SLUG}`)).toBeVisible();
  await expect(card.getByText("Takes a minute. Sign in with Google or your email.")).toBeVisible();
  const qr = card.getByRole("img", { name: `QR code for localhost:3000/r/${SLUG}` });
  await expect(qr).toBeVisible();
  await expect(qr.locator("svg path")).toHaveCount(2);

  // Printing shows only the sheet of four cards.
  await trader.emulateMedia({ media: "print" });
  await expect(trader.locator(".rcard-sheet .rcard")).toHaveCount(4);
  await expect(trader.locator(".rcard-sheet")).toBeVisible();
  await expect(card).toBeHidden();
  await expect(trader.locator("header.bar")).toBeHidden();

  // Someone with no listing gets no card.
  const other = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await signInWithEmail(other, `card-nobody@${E2E_EMAIL_DOMAIN}`, { first: "Nell", surname: "Body", next: "/platform/provider/card" });
  await expect(other.getByRole("heading", { name: "No listing found" })).toBeVisible();
});
