import disposable from "@/lib/disposable-email-domains.json";

// Email address rules shared by sign-in limits, duplicate checks and retention.
// private.normalise_email in supabase/migrations/20261012000018_disposable_email_domains.sql implements the
// same rules; tests/unit/email.test.ts and supabase/tests/email_rules.test.sql share one table of cases.

const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * One key per mailbox, for limits, duplicate checks and retention (never sent to Supabase, which gets the
 * address as typed, trimmed and lowercased). Trim, lowercase, drop everything from the first "+" in the
 * local part, and for gmail.com/googlemail.com drop dots and use gmail.com. Null when the trimmed input is
 * over 254 characters or isn't shaped like name@domain.tld.
 */
export function normaliseEmail(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length > 254 || !SHAPE.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  const at = lower.lastIndexOf("@");
  let local = lower.slice(0, at).split("+")[0];
  let domain = lower.slice(at + 1);
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  if (!local) return null;
  return `${local}@${domain}`;
}

/** The lowercased part after the last "@", or null when there is none. */
export function emailDomain(input: string): string | null {
  const v = input.trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 0 || at === v.length - 1) return null;
  return v.slice(at + 1);
}

const DISPOSABLE: ReadonlySet<string> = new Set(disposable.domains);

/** True when the domain or any parent domain (a.b.mailinator.com → b.mailinator.com → mailinator.com) is listed. */
export function isDisposableDomain(domain: string, list: ReadonlySet<string> = DISPOSABLE): boolean {
  let d = domain.trim().toLowerCase();
  while (d.includes(".")) {
    if (list.has(d)) return true;
    d = d.slice(d.indexOf(".") + 1);
  }
  return false;
}
