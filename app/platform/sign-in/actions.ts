"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { welcomePath } from "@/lib/auth";
import { checkLineType } from "@/lib/line-type";
import { requestSignInCode, SIGN_IN_ERRORS } from "@/lib/otp-gate";
import { safeNext } from "@/lib/safe-next";
import { createServerAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SignInState = { step: "phone" | "code"; phone?: string; next: string; error?: string };

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/** Step 1 (and "Send a new code"): checks the number, then texts a code. */
export async function requestCode(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const next = safeNext(field(fd, "next"));
  const input = field(fd, "phone");
  const service = createServiceClient();
  const supabase = await createServerAuthClient();

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
    lookup: (phone) => checkLineType(phone),
    send: async (phone) => {
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
      return { error };
    },
  });

  if (!result.ok) return { step: "phone", phone: input, next, error: result.error };
  return { step: "code", phone: result.phone, next };
}

/** Step 2: checks the code, signs the person in, then sends them on (via Welcome for a new account). */
export async function verifyCode(prev: SignInState, fd: FormData): Promise<SignInState> {
  const next = safeNext(field(fd, "next"));
  const phone = field(fd, "phone") || prev.phone || "";
  const code = field(fd, "code").replace(/\s+/g, "");
  const again: SignInState = { step: "code", phone, next, error: SIGN_IN_ERRORS.bad_code };
  if (!/^\+447[1-9]\d{8}$/.test(phone) || !/^\d{6}$/.test(code)) return again;

  const supabase = await createServerAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error || !data.session) return again;

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
