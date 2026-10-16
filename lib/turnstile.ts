import "server-only";

// Cloudflare Turnstile (free) on "Email me a code" (Plan 2b final review I2): stops scripts from burning the daily
// email allowance. TURNSTILE_SITE_KEY is public (sent to the browser for the widget); TURNSTILE_SECRET_KEY stays on
// the server. With neither set (local, CI) the check is skipped; with only one set it fails closed.

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** The form field the widget fills with its token. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "rejected" | "misconfigured" | "unreachable" };

const env = (name: string) => process.env[name]?.trim() || null;

/** The widget's site key, or null when Turnstile is off. Read at request time. */
export function turnstileSiteKey(): string | null {
  return env("TURNSTILE_SITE_KEY");
}

/** Asks Cloudflare whether the widget's token is good. Never throws. */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  const site = env("TURNSTILE_SITE_KEY");
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!site && !secret) return { ok: true };
  if (!site || !secret) {
    console.error("turnstile: set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither");
    return { ok: false, reason: "misconfigured" };
  }
  const response = (token ?? "").trim();
  if (!response) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({ secret, response });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { success?: unknown; "error-codes"?: unknown } | null;
    if (!res.ok || !json || typeof json.success !== "boolean") {
      console.error("turnstile: unexpected answer from siteverify", res.status);
      return { ok: false, reason: "unreachable" };
    }
    if (json.success) return { ok: true };
    return { ok: false, reason: "rejected" };
  } catch (err) {
    console.error("turnstile: siteverify failed:", err);
    return { ok: false, reason: "unreachable" };
  }
}
