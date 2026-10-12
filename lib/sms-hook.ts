import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Supabase "Send SMS" auth hook (final review I1). With the hook on, Supabase hands every text it wants to
// send (sign-in codes, including ones requested straight from its API) to /api/auth/sms-hook instead of
// sending it. We send only when sms_hook_gate finds a sign-in request the app's gate approved (rate limits,
// monthly cap, Lookup), once per request; everything else gets a non-2xx, which makes Supabase fail the call.

type Env = Record<string, string | undefined>;

export type SmsHookDeps = {
  /** SUPABASE_SMS_HOOK_SECRET, as Supabase shows it: "v1,whsec_<base64>". */
  secret: string | undefined;
  now(): number;
  gate(phoneE164: string): Promise<string>;
  send(phoneE164: string, body: string): Promise<{ ok: true } | { ok: false; reason: string }>;
};

export type HookResponse = { status: number; body: Record<string, unknown> };

const TOLERANCE_SECONDS = 5 * 60;
const UK_MOBILE = /^\+447[1-9]\d{8}$/;
// Ofcom's drama range 07700 900000-900999: never issued to real people, so safe to stub.
const DRAMA_RANGE = /^\+447700900\d{3}$/;

function refuse(status: number, message: string): HookResponse {
  return { status, body: { error: { http_code: status, message } } };
}

/** Standard Webhooks signature check, as GoTrue signs hook calls. */
export function verifyHookSignature(secret: string, headers: Headers, body: string, nowMs: number): boolean {
  const m = /^v1,whsec_([A-Za-z0-9+/=]+)$/.exec(secret.trim());
  if (!m) return false;
  const key = Buffer.from(m[1], "base64");
  if (key.length === 0) return false;

  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs || !/^\d+$/.test(ts)) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  for (const entry of sigs.split(/\s+/)) {
    const [version, sig] = entry.replace(/,$/, "").split(",", 2);
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export async function handleSendSmsHook(headers: Headers, rawBody: string, deps: SmsHookDeps): Promise<HookResponse> {
  if (!deps.secret) {
    console.error("sms-hook: SUPABASE_SMS_HOOK_SECRET is not set; refusing to send");
    return refuse(500, "SMS hook not configured");
  }
  if (!verifyHookSignature(deps.secret, headers, rawBody, deps.now())) {
    return refuse(401, "Bad signature");
  }

  let phone: string;
  let otp: string;
  let newPhone: string;
  try {
    const input = JSON.parse(rawBody) as { user?: { phone?: unknown; new_phone?: unknown }; sms?: { otp?: unknown } };
    phone = typeof input.user?.phone === "string" ? input.user.phone : "";
    newPhone = typeof input.user?.new_phone === "string" ? input.user.new_phone : "";
    otp = typeof input.sms?.otp === "string" ? input.sms.otp : "";
  } catch {
    return refuse(400, "Bad payload");
  }
  if (newPhone) return refuse(403, "Phone changes are not supported");
  const e164 = `+${phone.replace(/^\+/, "")}`;
  if (!UK_MOBILE.test(e164) || !/^\d{4,10}$/.test(otp)) return refuse(400, "Bad payload");

  let verdict: string;
  try {
    verdict = await deps.gate(e164);
  } catch (err) {
    console.error("sms-hook: gate failed:", err);
    return refuse(500, "Could not check the request");
  }
  if (verdict !== "ok") {
    console.info("sms-hook: refused a text the app did not approve");
    return refuse(403, "Sign-in texts are only sent through the sign-in page");
  }

  const sent = await deps.send(e164, `Your Bolton Vouched sign-in code is ${otp}. Don't share it with anyone.`);
  if (!sent.ok) {
    console.error("sms-hook: text not sent:", sent.reason);
    return refuse(502, "Could not send the text");
  }
  return { status: 200, body: {} };
}

/** Sends one text through a Twilio Messaging Service. */
export async function sendSms(
  to: string,
  body: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (env.TWILIO_SMS_STUB === "1" && DRAMA_RANGE.test(to)) {
    console.info(`sms-hook stub: would text ${to}`);
    return { ok: true };
  }
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const service = env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !service) return { ok: false, reason: "Twilio messaging credentials are not set" };
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, MessagingServiceSid: service, Body: body }).toString(),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `Twilio HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.name : "Error" };
  }
}
