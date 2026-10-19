import "server-only";
import {
  approvalEmail,
  approvalSms,
  type Approval,
  docEmail,
  jobAlertEmail,
  jobAlertSms,
  paymentReminderEmail,
  paymentReminderSms,
  questionAlertEmail,
  questionAlertSms,
  quoteAnsweredEmail,
  quoteAnsweredSms,
  reviewRequestEmail,
  reviewRequestSms,
  type DocMessage,
  type Email,
} from "@/lib/alert-text";
import { reviewLink } from "@/lib/review-link";
import { docNumber, money, publicDocPath, type TradeDoc } from "@/lib/trade-docs";
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

type DocClaim = { doc: TradeDoc; business_name: string; slug: string | null; send: Claimed[] };

function docMessage(c: { doc: TradeDoc; business_name: string }, link: string): DocMessage {
  return {
    business: c.business_name,
    customer: c.doc.customer_name,
    label: docNumber(c.doc.kind, c.doc.number),
    total: money(c.doc.total_pence),
    link,
  };
}

export type CustomerMessage = "review_request" | "payment_reminder_1" | "payment_reminder_2" | "doc_email";

/**
 * A message to a trader's customer about a quote or invoice: the review request after it's paid, a payment
 * reminder, or the trader's "Email it". Returns how many went. Never throws.
 */
export async function deliverCustomerMessage(kind: CustomerMessage, docId: string): Promise<number> {
  try {
    const { data, error } = await createServiceClient().rpc("claim_customer_message", { p_kind: kind, p_doc: docId });
    if (error) throw new Error(error.message);
    if (!data) return 0;
    const c = data as DocClaim;
    if (c.send.length === 0) return 0;
    let sms: string;
    let email: Email;
    if (kind === "review_request") {
      // Only a live listing can be reviewed.
      if (!c.slug) return 0;
      const link = reviewLink(c.slug);
      sms = reviewRequestSms(c.business_name, link);
      email = reviewRequestEmail(c.business_name, c.doc.customer_name, link);
    } else {
      const m = docMessage(c, absoluteUrl(publicDocPath(c.doc.token)));
      const second = kind === "payment_reminder_2";
      sms = paymentReminderSms(m, second);
      email = kind === "doc_email" ? docEmail(c.doc.kind, m) : paymentReminderEmail(m, second);
    }
    await sendAll(c.send, sms, email);
    return c.send.length;
  } catch (err) {
    console.error(`notify: ${kind} failed:`, err);
    return 0;
  }
}

/** Tells the trader their quote was accepted or declined. Never throws. */
export async function deliverQuoteAnswerAlert(docId: string): Promise<void> {
  try {
    const { data, error } = await createServiceClient().rpc("claim_quote_answer_alert", { p_doc: docId });
    if (error) throw new Error(error.message);
    if (!data) return;
    const c = data as { doc: TradeDoc; send: Claimed[] };
    if (c.send.length === 0) return;
    const m = docMessage({ doc: c.doc, business_name: "" }, absoluteUrl(platformPath("provider", "docs", c.doc.id)));
    const accepted = c.doc.status === "accepted";
    await sendAll(c.send, quoteAnsweredSms(m, accepted), quoteAnsweredEmail(m, accepted));
  } catch (err) {
    console.error("notify: quote answer alert failed:", err);
  }
}

/**
 * Tells a trader their listing is approved, by email (the account's) and text (the request's mobile). Pro choosers
 * land on the Pro offer on their listing page, where they pay. Best effort: a failure is logged, never thrown.
 */
export async function deliverApproval(to: { email: string | null; phone: string | null }, a: Approval): Promise<{ email: boolean; sms: boolean }> {
  // Signed out, the listing page sends them through sign-in and back; the browser keeps the #pro.
  const link = `${absoluteUrl(platformPath("provider"))}${a.pro ? "#pro" : ""}`;
  const [email, sms] = await Promise.all([
    to.email ? sendEmail(to.email, approvalEmail(a, link)) : Promise.resolve({ ok: false as const, reason: "no email" }),
    to.phone ? sendSms(to.phone, approvalSms(a, link)) : Promise.resolve({ ok: false as const, reason: "no mobile" }),
  ]);
  if (!email.ok) console.error("notify: approval email not sent:", email.reason);
  if (!sms.ok) console.error("notify: approval text not sent:", sms.reason);
  return { email: email.ok, sms: sms.ok };
}
