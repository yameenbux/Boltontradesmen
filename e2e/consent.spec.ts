import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sql(query: string): string {
  return execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();
}

// The text of every statement paragraph exactly as rendered, in order (one per card, plus the controller line).
async function renderedParagraphs(page: Page): Promise<string[]> {
  return page.locator("[data-consent-paragraph]").evaluateAll((els) => els.map((el) => el.textContent ?? ""));
}

test("provider consents via their link, then the admin sets them live", async ({ page, browser }) => {
  const name = `E2E Consent ${Date.now()}`;
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Add provider" }).click();
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("Contact name").fill("Sam Tester");
  await page.getByLabel("WhatsApp number (optional)").fill("07700 900127");
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
  await consent.goto(`/platform/consent/${token}`);
  // Summary card: greeting by first name, then business, trade and areas.
  await expect(consent.getByRole("heading", { name: "Sam, here's how you'll appear on Bolton Vouched" })).toBeVisible();
  const summary = consent.getByRole("region", { name: /how you'll appear/ });
  await expect(summary.getByText(name, { exact: true })).toBeVisible();
  await expect(summary.getByText("Sam Tester", { exact: true })).toBeVisible();
  await expect(summary.getByText("Plumber", { exact: true })).toBeVisible();
  await expect(summary.getByText("BL1, BL2")).toBeVisible();
  await expect(summary.getByText("Call and WhatsApp buttons (your number isn't shown)")).toBeVisible();
  // The statement: every paragraph is rendered as its own card (the controller line last).
  const paragraphs = await renderedParagraphs(consent);
  expect(paragraphs).toHaveLength(6);
  await expect(consent.getByText("Reviews go live without your approval", { exact: false })).toBeVisible();
  await expect(consent.getByText("simply because you disagree", { exact: false })).toBeVisible();
  await expect(consent.getByText("within one working day", { exact: false })).toBeVisible();
  await expect(consent.getByText("come back if you list again", { exact: false })).toBeVisible();
  await expect(consent.getByText("comes from reviews only", { exact: false })).toBeVisible();
  await expect(consent.getByText("the data controller for this information", { exact: false })).toBeVisible();
  expect(paragraphs[4]).toBe("I have read and agree to the terms and the privacy notice.");
  await expect(consent.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "/privacy");
  await expect(consent.getByRole("link", { name: "terms", exact: true })).toHaveAttribute("href", "/terms");
  expect(paragraphs.join("\n")).not.toMatch(/tradespeople/i);

  // No horizontal scroll at phone width.
  await consent.setViewportSize({ width: 360, height: 740 });
  expect(await consent.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  // The button stays greyed out until the terms and privacy box is ticked.
  const agree = consent.getByRole("button", { name: "I agree, list me" });
  await expect(agree).toBeDisabled();
  await expect(consent.getByText("Tick the box above to continue.")).toBeVisible();
  await consent.getByRole("checkbox", { name: /I have read and agree to the terms/ }).check();
  await expect(agree).toBeEnabled();
  await agree.click();
  await expect(consent.getByRole("heading", { name: "You're all set, Sam" })).toBeVisible();
  await expect(consent.getByText("once we've checked it", { exact: false })).toBeVisible();
  // "Manage your listing": a single-use trader link (sign in, then link the listing to that account).
  const manage = consent.getByRole("link", { name: "Manage your listing" });
  await expect(manage).toHaveAttribute("href", /^\/platform\/link\/[0-9a-f-]{36}$/);
  expect(
    sql(
      `select count(*) from public.trader_link_tokens t join public.providers p on p.id = t.provider_id where p.business_name = '${name}' and t.used_at is null and t.revoked_at is null`,
    ),
  ).toBe("1");
  await manage.click();
  await expect(consent).toHaveURL(/\/platform\/sign-in/);
  await consent.goBack();
  await expect(consent.getByRole("button", { name: "I agree, list me" })).toHaveCount(0);

  await consent.goto(`/platform/consent/${token}`);
  await expect(consent.getByText("This link is no longer valid").first()).toBeVisible();
  await ctx.close();

  expect(sql(`select consent_evidence->>'text_version' from public.providers where business_name = '${name}'`)).toBe("2026-10-17");
  // Review Focus 5: the stored hash is the hash of exactly the paragraphs the provider saw.
  const shown = createHash("sha256").update(paragraphs.join("\n\n")).digest("hex");
  expect(sql(`select consent_evidence->>'text_sha256' from public.providers where business_name = '${name}'`)).toBe(shown);

  await page.reload();
  await expect(page.getByTestId("provider-status")).toHaveText("consented");
  await expect(page.getByRole("button", { name: "New consent link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Set live" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("live");

  const ev = JSON.parse(sql(`select consent_evidence::text from public.providers where business_name = '${name}'`));
  expect(ev.text_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(ev.owner_legal_name).toBeTruthy();
  expect(ev.contact_email).toBeTruthy();

  // Pause, then set live again (consent already on record).
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("paused");
  await expect(page.getByRole("button", { name: "Set live" })).toBeEnabled();
  await page.getByRole("button", { name: "Set live" }).click();
  await expect(page.getByTestId("provider-status")).toHaveText("live");
});

test.describe("an expired consent link", () => {
  let token = "";
  test.beforeAll(() => {
    const slug = `e2e-expired-${Date.now()}`;
    token = sql(
      `insert into public.providers (slug, business_name, phone_e164, areas, consent_token_expires_at)
       values ('${slug}', 'E2E Expired', '+447700900129', '{BL1}', now() - interval '1 minute') returning consent_token`,
    );
  });

  test("shows the invalid message", async ({ page }) => {
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    await page.goto(`/platform/consent/${token}`);
    await expect(page.getByText("This link is no longer valid").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "I agree, list me" })).toHaveCount(0);
  });
});

test("garbage and unknown tokens show the invalid message", async ({ page }) => {
  await page.goto("/platform/consent/not-a-token");
  await expect(page.getByText("This link is no longer valid").first()).toBeVisible();
  await page.goto("/platform/consent/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("This link is no longer valid").first()).toBeVisible();
});

test("a provider with no contact name or WhatsApp gets the plain greeting", async ({ page }) => {
  const name = `E2E Nameless ${Date.now()}`;
  const token = sql(
    `insert into public.providers (slug, business_name, phone_e164, areas) values ('e2e-nameless-${Date.now()}', '${name}', '+447700900126', '{BL3}') returning consent_token`,
  );
  await page.goto(`/platform/consent/${token}`);
  await expect(page.getByRole("heading", { name: "Here's how you'll appear on Bolton Vouched" })).toBeVisible();
  await expect(page.getByText("None yet")).toBeVisible();
  await expect(page.getByText("A call button (your number isn't shown)")).toBeVisible();
  await page.getByRole("checkbox", { name: /I have read and agree to the terms/ }).check();
  await page.getByRole("button", { name: "I agree, list me" }).click();
  await expect(page.getByRole("heading", { name: "You're all set", exact: true })).toBeVisible();
  expect(sql(`select status from public.providers where business_name = '${name}'`)).toBe("consented");
});
