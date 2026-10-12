import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { latestCode } from "./mailbox";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Options = { first?: string; surname?: string; district?: string; groupCode?: string; next?: string };

/**
 * Signs in on /platform/sign-in with a 6-digit email code read from the local inbox. If Welcome appears
 * (no profile yet), completes it with the given names and area (BL1 by default). Ends wherever the app
 * sends the person next. Use addresses at E2E_EMAIL_DOMAIN (db:reset deletes their accounts).
 */
export async function signInWithEmail(page: Page, email: string, opts: Options = {}) {
  const url = opts.next ? `/platform/sign-in?next=${encodeURIComponent(opts.next)}` : "/platform/sign-in";
  await page.goto(url);
  const sentAfter = new Date(Date.now() - 1000);
  await page.getByLabel("Your email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/We've sent a 6-digit code to/)).toBeVisible();
  const code = await latestCode(email, sentAfter);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/platform/sign-in"));
  if (new URL(page.url()).pathname === "/platform/welcome") {
    await page.getByLabel("First name").fill(opts.first ?? "Test");
    await page.getByLabel("Surname").fill(opts.surname ?? "Resident");
    await page.getByLabel("Your area").selectOption(opts.district ?? "BL1");
    if (opts.groupCode) await page.getByLabel(/Group code/).fill(opts.groupCode);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await page.waitForURL((u) => u.pathname !== "/platform/welcome");
  }
}

/**
 * Gives the account for `email` a Google identity, as when an email-code account later continues with
 * Google (GoTrue links the same verified address). CI has no Google, so this is how E2E makes a Google account.
 */
export async function markAsGoogle(email: string) {
  const lit = `'${email.replace(/'/g, "''")}'`;
  execFileSync("psql", [
    DB_URL,
    "-X",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
     select 'e2e-sub-' || u.id, u.id,
            jsonb_build_object('sub', 'e2e-sub-' || u.id, 'email', u.email, 'email_verified', true),
            'google', now(), now(), now()
     from auth.users u where u.email = ${lit}
     on conflict do nothing`,
  ]);
}

/** A Google account for E2E: signs in with an email code, then adds a Google identity (see markAsGoogle). */
export async function signInAsGoogle(page: Page, email: string, opts: Options = {}) {
  await signInWithEmail(page, email, opts);
  await markAsGoogle(email);
}
