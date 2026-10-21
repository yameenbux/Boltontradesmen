import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type BrowserContext, type Page } from "@playwright/test";

// The e2e admins (scripts/e2e-prepare.sh). admin@ and code-admin@ have an authenticator with this test-only key;
// setup-admin@ has none.
export const ADMIN_EMAIL = "admin@example.test";
export const SETUP_ADMIN_EMAIL = "setup-admin@example.test";
export const CODE_ADMIN_EMAIL = "code-admin@example.test";
export const ADMIN_PASSWORD = "e2e-admin-password";
export const ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

/** The current 6-digit code for an authenticator key (RFC 6238: SHA-1, 30-second steps). */
export function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Where e2e/admin.setup.ts keeps the signed-in admin's session for the other tests. */
export const ADMIN_STATE = "e2e/.auth/admin.json";

/**
 * Password, then the authenticator code: the admin's two steps, done for real. Ends on the admin home page.
 * Supabase Auth ends an account's password-only (aal1) sessions whenever that account passes the code step, so tests
 * running in parallel can't each do this as the same admin: e2e/admin.setup.ts does it once, and adminSignIn below
 * reuses that session.
 */
export async function adminSignInWithCode(page: Page, email: string = ADMIN_EMAIL): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await page.getByLabel("6-digit code").fill(totp(ADMIN_TOTP_SECRET));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}

/** The admin, signed in with both steps (the session from e2e/admin.setup.ts), on the admin home page. */
export async function adminSignIn(page: Page): Promise<void> {
  const state = JSON.parse(readFileSync(ADMIN_STATE, "utf8")) as { cookies: Awaited<ReturnType<BrowserContext["cookies"]>> };
  await page.context().addCookies(state.cookies);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}
