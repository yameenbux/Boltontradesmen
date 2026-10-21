// The pre-launch lock. While SITE_LOCK_PASSWORD is set, every page asks for that password first (once per browser,
// for 30 days), search engines are told to keep out, and nothing is indexed. Clearing the variable in Railway opens
// the site. Machine traffic still gets through: Stripe's webhook, the cron job and Supabase's SMS hook (/api/*), and
// the Google sign-in return. Links a trader hands to a customer (a review link, a quote or invoice, a consent link, a
// trader sign-in link) let that person in too, so a closed beta works end to end.
// Pure and Node-only (proxy.ts runs on Node): no Next imports, so it's unit-tested directly.
import { createHmac, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

export const LOCK_COOKIE = "bv_site_access";
export const LOCK_PATH = "/site-lock";
export const LOCK_MAX_AGE = 60 * 60 * 24 * 30;

/** The password, or null when the site is open. */
export function lockPassword(env: Env = process.env): string | null {
  const p = env.SITE_LOCK_PASSWORD?.trim();
  return p ? p : null;
}

/** The cookie value for a password: changing the password signs everyone out of the beta. */
export function accessToken(password: string, env: Env = process.env): string {
  const key = env.DEVICE_HASH_SECRET?.trim() || "bv-site-lock";
  return createHmac("sha256", key).update(`site-lock:${password}`).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(given: string, password: string): boolean {
  return same(given.trim(), password);
}

export function hasAccess(cookie: string | undefined, password: string, env: Env = process.env): boolean {
  return !!cookie && same(cookie, accessToken(password, env));
}

/** Paths that never ask: machine traffic and the lock page itself. */
export function isOpenPath(path: string): boolean {
  return (
    path === LOCK_PATH ||
    path.startsWith("/api/") ||
    path === "/auth/callback" ||
    path === "/robots.txt" ||
    path === "/favicon.ico" ||
    path.startsWith("/icons/") ||
    path === "/manifest.webmanifest"
  );
}

/** Links a trader shares with someone outside the beta: opening one lets that browser in. */
export function grantsAccess(path: string): boolean {
  return (
    /^\/p\/[^/]+\/review\/?$/.test(path) ||
    /^\/d\/[^/]+\/?$/.test(path) ||
    /^\/consent\/[^/]+\/?$/.test(path) ||
    /^\/link\/[^/]+\/?$/.test(path)
  );
}

/** Where the lock page sends someone back to: only this site's own paths. */
export function safeReturn(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith(LOCK_PATH)) return "/";
  return raw;
}
