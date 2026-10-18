import "server-only";
import { jobAlertEmail, jobAlertSms, questionAlertEmail, questionAlertSms, type Email } from "@/lib/alert-text";
import { platformPath } from "@/lib/paths";
import { absoluteUrl } from "@/lib/seo";
import { sendSms } from "@/lib/sms-hook";
import { createServiceClient } from "@/lib/supabase/service";

// Sends a Pro trader's alerts (job requests, Ask Bolton questions). The database claims each alert first (one row per
// item, listing and channel, under the day's caps: claim_* functions), the app sends it, then marks it sent or
// failed. A claimed alert is never sent twice, even if this runs again. Runs after the response (next/server
// after()), so a slow text never holds up the person's page.

type Env = Record<string, string | undefined>;
type Result = { ok: true } | { ok: false; reason: string };
type Claimed = { id: string; provider_id: string; channel: "sms" | "email"; to: string };

const FROM_DEFAULT = "Bolton Vouched <noreply@ysbdesigns.uk>";

/** One email through Resend's API. NOTIFY_EMAIL_STUB=1 (local and CI) only logs it. */
export async function sendEmail(to: string, email: Email, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<Result> {
  if (env.NOTIFY_EMAIL_STUB === "1") {
    console.info(`notify stub: would email ${to}: ${email.subject}`);
    return { ok: true };
  }
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, reason: "RESEND_API_KEY is not set" };
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM?.trim() || FROM_DEFAULT,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `Resend HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.name : "Error" };
  }
}

async function sendAll(send: Claimed[], sms: string, email: Email): Promise<void> {
  const db = createServiceClient();
  await Promise.all(
    send.map(async (c) => {
      const r = c.channel === "sms" ? await sendSms(c.to, sms) : await sendEmail(c.to, email);
      if (!r.ok) console.error(`notify: ${c.channel} alert ${c.id} not sent:`, r.reason);
      const { error } = await db.rpc("mark_notification", { p_id: c.id, p_ok: r.ok, p_reason: r.ok ? null : r.reason });
      if (error) console.error("notify: mark_notification failed:", error.message);
    }),
  );
}

/** Tells the trader about a new job request. Never throws. */
export async function deliverJobRequestAlerts(requestId: string): Promise<void> {
  try {
    const { data, error } = await createServiceClient().rpc("claim_job_request_alerts", { p_request: requestId });
    if (error) throw new Error(error.message);
    if (!data) return;
    const { request: j, send } = data as { request: { name: string; phone: string; district: string; body: string }; send: Claimed[] };
    if (send.length === 0) return;
    const link = `${absoluteUrl(platformPath("provider"))}#requests`;
    await sendAll(send, jobAlertSms(j, link), jobAlertEmail(j, link));
  } catch (err) {
    console.error("notify: job request alerts failed:", err);
  }
}

/** Tells Pro traders in the trade and area about a question that's just gone public. Never throws. */
export async function deliverQuestionAlerts(questionId: string): Promise<void> {
  try {
    const { data, error } = await createServiceClient().rpc("claim_question_alerts", { p_question: questionId });
    if (error) throw new Error(error.message);
    if (!data) return;
    const { question: q, send } = data as { question: { id: string; district: string; body: string; category: string }; send: Claimed[] };
    if (send.length === 0) return;
    const link = absoluteUrl(platformPath("ask", q.id, "answer"));
    await sendAll(send, questionAlertSms(q, link), questionAlertEmail(q, link));
  } catch (err) {
    console.error("notify: question alerts failed:", err);
  }
}
