"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { welcomePath } from "@/lib/auth";
import { clientIpFrom } from "@/lib/client-ip";
import { normaliseEmail } from "@/lib/email";
import { EMAIL_SIGN_IN_ERRORS, requestEmailSignInCode } from "@/lib/email-gate";
import { googleErrorPath } from "@/lib/google-callback";
import { ipHash } from "@/lib/ip-hash";
import { checkLineType } from "@/lib/line-type";
import { requestSignInCode, SIGN_IN_ERRORS } from "@/lib/otp-gate";
import { safeNext } from "@/lib/safe-next";
import { phoneSignInEnabled } from "@/lib/sign-in-methods";
import { createServerAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

export type SignInState = { step: "phone" | "code"; phone?: string; next: string; error?: string };
export type EmailSignInState = { step: "email" | "code"; email?: string; next: string; error?: string };

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return clientIpFrom(h) ?? "unknown";
}

/** Step 1 (and "Send a new code"): checks the number, then texts a code. */
export async function requestCode(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const next = safeNext(field(fd, "next"));
  if (!phoneSignInEnabled()) return { step: "phone", next, error: SIGN_IN_ERRORS.phone_off };
  const input = field(fd, "phone");
  const service = createServiceClient();

  const result = await requestSignInCode(input, await clientIp(), {
    gate: async (phone, ipHash) => {
      const { data, error } = await service.rpc("otp_gate", { p_phone: phone, p_ip_hash: ipHash });
      if (error) throw new Error(`otp_gate: ${error.message}`);
      const row = (data as { request_id: number; verdict: string }[] | null)?.[0];
      if (!row) throw new Error("otp_gate returned nothing");
      return { requestId: row.request_id, verdict: row.verdict };
    },
    record: async (id, outcome, lineType) => {
      const { error } = await service.rpc("otp_record", {
        p_request_id: id,
        p_outcome: outcome,
        p_line_type: lineType,
      });
      if (error) throw new Error(`otp_record: ${error.message}`);
    },
    approve: async (id, lineType, nonceHash) => {
      const { error } = await service.rpc("otp_approve", {
        p_request_id: id,
        p_line_type: lineType,
        p_nonce_hash: nonceHash,
      });
      if (error) throw new Error(`otp_approve: ${error.message}`);
    },
    lookup: (phone) => checkLineType(phone),
    send: async (phone, nonce) => {
      // bv_nonce reaches auth.users.raw_user_meta_data on a new account, where the database guard checks
      // it against the approved request and strips it. Existing accounts ignore it. Sent with the service key,
      // which Supabase's CAPTCHA lets through (this server does its own checks first).
      const { error } = await service.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true, data: { bv_nonce: nonce } },
      });
      return { error };
    },
  });

  if (!result.ok) return { step: "phone", phone: input, next, error: result.error };
  return { step: "code", phone: result.phone, next };
}

const LOCKED: Record<string, string> = {
  number_locked: SIGN_IN_ERRORS.code_number_locked,
  ip_locked: SIGN_IN_ERRORS.code_ip_locked,
};

/**
 * Step 2: checks the code, signs the person in, then sends them on (via Welcome for a new account).
 * Every check first passes the wrong-code limiter (otp_verify_gate: per number and per connection), because
 * Supabase's own per-IP limit sees only this server's address and so is shared by everyone.
 */
export async function verifyCode(prev: SignInState, fd: FormData): Promise<SignInState> {
  const next = safeNext(field(fd, "next"));
  if (!phoneSignInEnabled()) return { step: "phone", next, error: SIGN_IN_ERRORS.phone_off };
  const phone = field(fd, "phone") || prev.phone || "";
  const code = field(fd, "code").replace(/\s+/g, "");
  const again: SignInState = { step: "code", phone, next, error: SIGN_IN_ERRORS.bad_code };
  if (!/^\+447[1-9]\d{8}$/.test(phone) || !/^\d{6}$/.test(code)) return again;

  const service = createServiceClient();
  let attemptId: number;
  try {
    const { data: gate, error: gateError } = await service.rpc("otp_verify_gate", {
      p_phone: phone,
      p_ip_hash: ipHash(await clientIp()),
    });
    if (gateError) throw new Error(`otp_verify_gate: ${gateError.message}`);
    const row = (gate as { attempt_id: number; verdict: string }[] | null)?.[0];
    if (!row) throw new Error("otp_verify_gate returned nothing");
    if (row.verdict !== "ok") {
      if (!LOCKED[row.verdict]) throw new Error(`otp_verify_gate: unexpected verdict ${row.verdict}`);
      return { ...again, error: LOCKED[row.verdict] };
    }
    attemptId = row.attempt_id;
  } catch (err) {
    console.error("sign-in: code limiter failed:", err);
    return { ...again, error: SIGN_IN_ERRORS.verify_failed };
  }

  const supabase = await createServerAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  const right = !error && !!data.session;
  const { error: recordError } = await service.rpc("otp_verify_record", { p_attempt_id: attemptId, p_ok: right });
  if (recordError) console.error("sign-in: could not record the code check:", recordError.message);
  if (!right) return again;

  const { data: account, error: accountError } = await supabase.rpc("my_account");
  if (accountError) {
    console.error("sign-in: my_account failed:", accountError.message);
    return { ...again, error: SIGN_IN_ERRORS.lookup_failed };
  }
  const row = account as { display_name: string | null; deleted: boolean } | null;
  if (!row || !row.display_name || row.deleted) redirect(welcomePath(next));

  // A provider may have been listed (or relisted) since they last signed in.
  const { error: claimError } = await supabase.rpc("claim_provider_listings");
  if (claimError) console.error("sign-in: claim_provider_listings failed:", claimError.message);
  redirect(next);
}

// ---------------------------------------------------------------- email code

/** Step 1 (and "Send a new code"): checks the address, then emails a 6-digit code. */
export async function requestEmailCode(_prev: EmailSignInState, fd: FormData): Promise<EmailSignInState> {
  const next = safeNext(field(fd, "next"));
  const input = field(fd, "email");
  const ip = await clientIp();

  // Cloudflare Turnstile first (skipped when not configured), so scripts can't use up the daily email allowance.
  const human = await verifyTurnstile(field(fd, TURNSTILE_FIELD), ip);
  if (!human.ok) {
    const error =
      human.reason === "missing" || human.reason === "rejected" ? EMAIL_SIGN_IN_ERRORS.captcha : EMAIL_SIGN_IN_ERRORS.gate_failed;
    return { step: "email", email: input, next, error };
  }

  const result = await requestEmailSignInCode(input, ip, {
    gate: async (email, ipHash) => {
      const { data, error } = await createServiceClient().rpc("email_gate", { p_email: email, p_ip_hash: ipHash });
      if (error) throw new Error(`email_gate: ${error.message}`);
      const row = (data as { request_id: number; verdict: string }[] | null)?.[0];
      if (!row) throw new Error("email_gate returned nothing");
      return { requestId: row.request_id, verdict: row.verdict };
    },
    approve: async (id, nonceHash) => {
      const { error } = await createServiceClient().rpc("email_approve", { p_request_id: id, p_nonce_hash: nonceHash });
      if (error) throw new Error(`email_approve: ${error.message}`);
    },
    record: async (id, outcome) => {
      const { error } = await createServiceClient().rpc("email_record", { p_request_id: id, p_outcome: outcome });
      if (error) throw new Error(`email_record: ${error.message}`);
    },
    send: async (email, nonce) => {
      // bv_nonce reaches auth.users.raw_user_meta_data on a new account, where the database guard checks it
      // against the approved request and strips it. Existing accounts ignore it. Sent with the service key: Supabase's
      // CAPTCHA (on in production, for direct calls to its API) lets it through, as Turnstile was checked above.
      const { error } = await createServiceClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { bv_nonce: nonce } },
      });
      return { error: error ? { status: error.status, message: error.message } : null };
    },
  });

  if (!result.ok) return { step: "email", email: input, next, error: result.error };
  return { step: "code", email: result.email, next };
}

const EMAIL_LOCKED: Record<string, string> = {
  address_locked: EMAIL_SIGN_IN_ERRORS.code_address_locked,
  ip_locked: EMAIL_SIGN_IN_ERRORS.code_ip_locked,
};

/**
 * Step 2: checks the emailed code, signs the person in, then sends them on (via Welcome for a new account).
 * Every check first passes the wrong-code limiter (email_verify_gate: per normalised address and per connection,
 * shared with phone). Listings are linked only by an admin's trader sign-in link, never here.
 */
export async function verifyEmailCode(prev: EmailSignInState, fd: FormData): Promise<EmailSignInState> {
  const next = safeNext(field(fd, "next"));
  const email = (field(fd, "email") || prev.email || "").trim().toLowerCase();
  const code = field(fd, "code").replace(/\s+/g, "");
  const again: EmailSignInState = { step: "code", email, next, error: EMAIL_SIGN_IN_ERRORS.bad_code };
  if (!normaliseEmail(email) || !/^\d{6}$/.test(code)) return again;

  const service = createServiceClient();
  let attemptId: number;
  try {
    const { data: gate, error: gateError } = await service.rpc("email_verify_gate", {
      p_email: email,
      p_ip_hash: ipHash(await clientIp()),
    });
    if (gateError) throw new Error(`email_verify_gate: ${gateError.message}`);
    const row = (gate as { attempt_id: number; verdict: string }[] | null)?.[0];
    if (!row) throw new Error("email_verify_gate returned nothing");
    if (row.verdict !== "ok") {
      if (!EMAIL_LOCKED[row.verdict]) throw new Error(`email_verify_gate: unexpected verdict ${row.verdict}`);
      return { ...again, error: EMAIL_LOCKED[row.verdict] };
    }
    attemptId = row.attempt_id;
  } catch (err) {
    console.error("sign-in: email code limiter failed:", err);
    return { ...again, error: EMAIL_SIGN_IN_ERRORS.verify_failed };
  }

  const supabase = await createServerAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  const right = !error && !!data.session;
  const { error: recordError } = await service.rpc("otp_verify_record", { p_attempt_id: attemptId, p_ok: right });
  if (recordError) console.error("sign-in: could not record the code check:", recordError.message);
  if (!right) return again;

  const { data: account, error: accountError } = await supabase.rpc("my_account");
  if (accountError) {
    console.error("sign-in: my_account failed:", accountError.message);
    return { ...again, error: EMAIL_SIGN_IN_ERRORS.verify_failed };
  }
  const row = account as { display_name: string | null; deleted: boolean } | null;
  if (!row || !row.display_name || row.deleted) redirect(welcomePath(next));
  redirect(next);
}

// ---------------------------------------------------------------- Google

/**
 * "Continue with Google": starts Supabase's Google OAuth with PKCE (the cookie client stores the code verifier)
 * and sends the browser to it. Google comes back through Supabase to /auth/callback, built on
 * NEXT_PUBLIC_SITE_URL (never the Host header), carrying `next`.
 */
export async function startGoogleSignIn(fd: FormData): Promise<void> {
  const next = safeNext(field(fd, "next"));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let url: string | null = null;
  try {
    const supabase = await createServerAuthClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) console.error("google sign-in: could not start:", error.message);
    else url = data.url ?? null;
  } catch (err) {
    console.error("google sign-in: could not start:", err);
  }
  if (!site || !url) redirect(googleErrorPath(next));
  redirect(url);
}
