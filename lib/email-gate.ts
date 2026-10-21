import { createHash, randomBytes } from "node:crypto";
import { emailDomain, isDisposableDomain, normaliseEmail } from "@/lib/email";
import { ipHash } from "@/lib/ip-hash";

// Exact copy shown on the sign-in page for the email code. Never a raw error.
export const EMAIL_SIGN_IN_ERRORS = {
  invalid: "Enter your email address, like name@example.com.",
  blocked_domain: "Please use your own email address. Temporary or throwaway addresses can't sign in.",
  address_limited: "Too many codes for this address. Please wait 15 minutes and try again.",
  ip_limited: "Too many sign-in attempts from this connection. Please try again in an hour.",
  cap_reached: "Sign-in emails are paused for today. Please try again tomorrow, or continue with Google.",
  address_taken:
    "There's already an account for this address. Use the exact address you signed up with, or continue with Google.",
  admin_address: "This address can't sign in here.",
  too_soon: "Please wait a minute before asking for another code.",
  busy: "A lot of people are signing in right now. Please try again in an hour, or use Continue with Google.",
  captcha: "Please complete the security check, then try again.",
  send_failed: "We couldn't send the email just now. Please try again in a minute.",
  gate_failed: "We couldn't start sign-in just now. Please try again in a minute.",
  bad_code: "That code didn't work. Check the email and try again, or send a new code.",
  code_address_locked: "Too many wrong codes for this address. Please wait 15 minutes, then send yourself a new code.",
  code_ip_locked: "Too many wrong codes from this connection. Please try again in an hour.",
  verify_failed: "We couldn't check your code just now. Please try again in a minute.",
} as const;

export type EmailGateDeps = {
  /** public.email_gate: format, admin, disposable, taken, limits and caps (recorded in email_requests). */
  gate(email: string, ipHash: string): Promise<{ requestId: number; verdict: string }>;
  /** Marks the request approved and binds it to the nonce (only its sha256 is stored). */
  approve(id: number, nonceHash: string): Promise<void>;
  record(id: number, outcome: "sent" | "send_failed"): Promise<void>;
  /** Sends the code; the nonce must reach GoTrue in the sign-up metadata (`bv_nonce`). */
  send(email: string, nonce: string): Promise<{ error: { status?: number; message?: string } | null }>;
};

export type EmailCodeResult = { ok: true; email: string } | { ok: false; error: string };

const GATE_VERDICTS = new Set([
  "invalid",
  "admin_address",
  "blocked_domain",
  "address_taken",
  "address_limited",
  "ip_limited",
  "cap_reached",
]);
type GateVerdict = "invalid" | "admin_address" | "blocked_domain" | "address_taken" | "address_limited" | "ip_limited" | "cap_reached";

/**
 * Everything that happens before a sign-in email goes out, in order: shape check → throwaway-domain check
 * (both without touching the database) → database gate → approve the request, bound to a fresh single-use
 * nonce → send the address as typed (trimmed, lowercased; never the normalised form), passing the nonce to
 * GoTrue → record "sent" or "send_failed". The auth.users guard only lets a new email account in with the
 * nonce of an approved, unused request for its normalised address. Fails closed before the send.
 */
export async function requestEmailSignInCode(input: string, ip: string, deps: EmailGateDeps): Promise<EmailCodeResult> {
  const email = input.trim().toLowerCase();
  if (!normaliseEmail(email)) return { ok: false, error: EMAIL_SIGN_IN_ERRORS.invalid };
  if (isDisposableDomain(emailDomain(email) ?? "")) return { ok: false, error: EMAIL_SIGN_IN_ERRORS.blocked_domain };

  let requestId: number;
  const nonce = randomBytes(32).toString("base64url");
  try {
    const gate = await deps.gate(email, ipHash(ip || "unknown"));
    requestId = gate.requestId;
    // The admin's address signs in at /admin only. Answer as if a code had gone, so a script can't use this form to
    // find out which address that is (no email is sent; the gate has recorded the attempt against its limits).
    if (gate.verdict === "admin_address") return { ok: true, email };
    if (gate.verdict !== "ok") {
      if (GATE_VERDICTS.has(gate.verdict)) return { ok: false, error: EMAIL_SIGN_IN_ERRORS[gate.verdict as GateVerdict] };
      console.error("sign-in: unexpected email gate verdict", gate.verdict);
      return { ok: false, error: EMAIL_SIGN_IN_ERRORS.gate_failed };
    }
    await deps.approve(requestId, createHash("sha256").update(nonce).digest("hex"));
  } catch (err) {
    console.error("sign-in: email gate failed:", err);
    return { ok: false, error: EMAIL_SIGN_IN_ERRORS.gate_failed };
  }

  let sendError: { status?: number; message?: string } | null = null;
  try {
    sendError = (await deps.send(email, nonce)).error;
  } catch (err) {
    sendError = { message: err instanceof Error ? err.message : String(err) };
  }
  try {
    await deps.record(requestId, sendError ? "send_failed" : "sent");
  } catch (err) {
    console.error("sign-in: could not record the email send outcome:", err);
  }
  if (sendError) {
    if (sendError.status === 429) {
      // GoTrue answers 429 "…only request this after N seconds" when a code went to this address under a minute
      // ago (that code still works). Any other 429 is a site-wide limit (emails per hour, or requests from this
      // server's one address), so waiting a minute won't help.
      if (/second/i.test(sendError.message ?? "")) return { ok: false, error: EMAIL_SIGN_IN_ERRORS.too_soon };
      console.error("sign-in: Supabase's site-wide limit:", sendError.message);
      return { ok: false, error: EMAIL_SIGN_IN_ERRORS.busy };
    }
    console.error("sign-in: email not sent:", sendError);
    return { ok: false, error: EMAIL_SIGN_IN_ERRORS.send_failed };
  }
  return { ok: true, email };
}
