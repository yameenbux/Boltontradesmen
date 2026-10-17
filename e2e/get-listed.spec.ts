import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// Launch checklist: the public "Get listed" form. Cookie-free, checked in the browser and on the server, stored
// through submit_listing_request, and shown to the admin on /admin/requests.

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const BUSINESS = `E2E Listing ${Date.now()}`;

function sql(query: string): string {
  return execFileSync("psql", [DB_URL, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8",
  }).trim();
}

test.describe.configure({ mode: "serial" });

// Every E2E request comes from the same connection (3 a day) and these numbers (2 a week): start clean.
test.beforeAll(() => {
  sql("delete from public.listing_requests where business_name like 'E2E Listing %'");
});

test("the form page is indexable and sets no cookies", async ({ request }) => {
  const res = await request.get("/get-listed");
  expect(res.status()).toBe(200);
  expect(res.headers()["set-cookie"]).toBeUndefined();
  const html = await res.text();
  expect(html).toContain("<title>Get listed | Bolton Vouched</title>");
  expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
});

test("the browser shows inline messages for missing fields", async ({ page }) => {
  await page.goto("/get-listed");
  await page.getByRole("button", { name: "Send my request" }).click();
  const business = page.getByLabel("Business name");
  await expect(page.getByText("Enter your business name, in up to 80 characters.")).toBeVisible();
  await expect(business).toBeFocused();
  await expect(business).toHaveAttribute("aria-invalid", "true");
  await expect(business).toHaveAttribute("aria-describedby", /gl-business_name-err/);
  await expect(page.getByText("Tick the box to say you're the owner or have their permission.")).toBeVisible();
  await expect(page).toHaveURL(/\/get-listed$/);
});

test("a trader asks to be listed, gets the thank-you page, and the admin sees the request", async ({ page }) => {
  await page.goto("/get-listed");
  await page.getByLabel("Business name").fill(BUSINESS);
  await page.getByLabel("Your name").fill("Sam Tester");
  await page.getByLabel("Your trade").fill("Plumber");
  await page.getByLabel(/Areas you cover/).fill("BL3");
  await page.getByLabel("Mobile number").fill("07700 900777");
  await page.getByLabel(/Email/).fill("sam@example.test");
  await page.getByLabel(/Anything else/).fill("Boilers and bathrooms.");
  await page.getByLabel(/I'm the owner or I have their permission/).check();
  // Forms sent back within 3 seconds of being shown are treated as a script's.
  await page.waitForTimeout(3500);
  const [post] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/get-listed"),
    page.getByRole("button", { name: "Send my request" }).click(),
  ]);
  expect(post.headers()["set-cookie"]).toBeUndefined();
  await expect(page).toHaveURL(/\/get-listed\/thanks$/);
  await expect(page.getByRole("heading", { name: "Thanks, we've got your details" })).toBeVisible();
  await expect(page.getByText("within 2 working days")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect((await page.context().cookies()).length).toBe(0);

  expect(sql(`select phone_e164 || '|' || status from public.listing_requests where business_name = '${BUSINESS}'`)).toBe(
    "+447700900777|new",
  );

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /Requests/ }).click();
  const card = page.getByRole("article", { name: `Request from ${BUSINESS}` });
  await expect(card).toContainText("Sam Tester");
  await expect(card).toContainText("07700 900777");
  await expect(card).toContainText("Boilers and bathrooms.");
  await expect(card.getByRole("link", { name: /Create provider from this/ })).toHaveAttribute(
    "href",
    /\/admin\/providers\/new\?business=/,
  );
  await card.getByRole("button", { name: "Done" }).click();
  // The New list no longer shows it; the Done list does.
  await expect(card).toHaveCount(0);
  await page.getByRole("navigation", { name: "Request status" }).getByRole("link", { name: "Done" }).click();
  await expect(page.getByRole("article", { name: `Request from ${BUSINESS}` })).toBeVisible();
  expect(sql(`select status from public.listing_requests where business_name = '${BUSINESS}'`)).toBe("done");
});

test("creating a provider from a request marks the request done", async ({ page }) => {
  const business = `${BUSINESS} made`;
  sql(
    `insert into public.listing_requests (business_name, contact_name, trade, phone_e164) values ('${business}', 'Pat Tester', 'Joiner', '+447700900779')`,
  );
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
  await page.goto("/admin/requests");
  const card = page.getByRole("article", { name: `Request from ${business}` });
  await card.getByRole("link", { name: /Create provider from this/ }).click();
  await expect(page.getByLabel("Business name")).toHaveValue(business);
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page).toHaveURL(/\/admin\/providers\/[0-9a-f-]{36}$/);
  expect(sql(`select status from public.listing_requests where business_name = '${business}'`)).toBe("done");
  await page.goto("/admin/requests");
  await expect(page.getByRole("article", { name: `Request from ${business}` })).toHaveCount(0);
});

test("one listing per number: the admin can't add a second listing, and requests point to the existing one", async ({ page }) => {
  const business = `${BUSINESS} dupe`;
  // Ace Plumbing (fixture) already has +447700900301.
  sql(
    `insert into public.listing_requests (business_name, contact_name, trade, phone_e164) values ('${business}', 'Al Again', 'Plumber', '+447700900301')`,
  );
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();

  await page.goto("/admin/requests");
  const card = page.getByRole("article", { name: `Request from ${business}` });
  await expect(card.getByTestId("already-listed")).toContainText("This number is already on Ace Plumbing");
  await expect(card.getByRole("link", { name: /Create provider from this/ })).toHaveCount(0);

  await page.goto("/admin/providers/new");
  await page.getByLabel("Business name").fill(business);
  await page.getByLabel("Phone", { exact: true }).fill("07700 900301");
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByText("This number is already on Ace Plumbing")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/providers\/new/);
  expect(sql(`select count(*) from public.providers where business_name = '${business}'`)).toBe("0");
});

test("a filled honeypot gets the thank-you page and stores nothing", async ({ page }) => {
  await page.goto("/get-listed");
  await page.getByLabel("Business name").fill(`${BUSINESS} bot`);
  await page.getByLabel("Your name").fill("Bot");
  await page.getByLabel("Your trade").fill("Spam");
  await page.getByLabel("Mobile number").fill("07700 900778");
  await page.getByLabel(/I'm the owner or I have their permission/).check();
  await page.locator('input[name="website"]').fill("http://spam.example", { force: true });
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page).toHaveURL(/\/get-listed\/thanks$/);
  expect(sql(`select count(*) from public.listing_requests where business_name = '${BUSINESS} bot'`)).toBe("0");
});
