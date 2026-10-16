import { NextResponse } from "next/server";
import { phoneSignInEnabled } from "@/lib/sign-in-methods";
import { handleSendSmsHook, sendSms } from "@/lib/sms-hook";
import { createServiceClient } from "@/lib/supabase/service";

// Supabase "Send SMS" auth hook endpoint (README -> Deploying). Supabase signs each call with
// SUPABASE_SMS_HOOK_SECRET; the handler texts the code only for a request the sign-in page approved.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Phone sign-in switched off (SIGN_IN_PHONE): refuse before the signature check and before any RPC.
  if (!phoneSignInEnabled()) {
    return NextResponse.json(
      { error: { http_code: 403, message: "Phone sign-in is switched off" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const raw = await request.text();
  const res = await handleSendSmsHook(request.headers, raw, {
    secret: process.env.SUPABASE_SMS_HOOK_SECRET,
    now: () => Date.now(),
    gate: async (phone) => {
      const { data, error } = await createServiceClient().rpc("sms_hook_gate", { p_phone: phone });
      if (error) throw new Error(`sms_hook_gate: ${error.message}`);
      return String(data);
    },
    send: (phone, body) => sendSms(phone, body),
  });
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
