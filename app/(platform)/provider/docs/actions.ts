"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/lib/admin-shared";
import { requireMember } from "@/lib/auth";
import { deliverCustomerMessage } from "@/lib/notify";
import { platformPath } from "@/lib/paths";
import { InvalidPhoneError, toE164 } from "@/lib/phone";
import { ID_PATTERN } from "@/lib/review-form";
import { DOC_ERRORS, docTotal, parsePence, type DocLine } from "@/lib/trade-docs";

// Pro's quotes and invoices, the trader's side. The database checks the listing is the caller's and has Pro, and
// works out every total itself.

const text = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const FAILED = "Something went wrong. Please try again.";

function refused(where: string, message: string, values?: Record<string, string>): FormState {
  const known = DOC_ERRORS[message];
  if (!known) {
    console.error(`docs: ${where} failed:`, message);
    return { message: FAILED, values };
  }
  return known.field ? { errors: { [known.field]: known.message }, values } : { message: known.message, values };
}

/** Saves a quote or invoice from the editor, then opens it. */
export async function saveDoc(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember(platformPath("provider"));
  const keys = ["provider_id", "id", "kind", "customer_name", "customer_phone", "customer_email", "title", "until", "notes", "lines", "job_request_id", "deposit"];
  const values: Record<string, string> = Object.fromEntries(keys.map((k) => [k, text(fd, k)]));
  values.ask_review = fd.get("ask_review") === "on" ? "on" : "";
  if (!ID_PATTERN.test(values.provider_id) || (values.id && !ID_PATTERN.test(values.id))) return { message: FAILED, values };

  let phone: string | null = null;
  if (values.customer_phone.trim()) {
    try {
      phone = toE164(values.customer_phone);
    } catch (err) {
      if (!(err instanceof InvalidPhoneError)) throw err;
      return { errors: { customer_phone: DOC_ERRORS.bad_phone.message }, values };
    }
  }
  let lines: unknown;
  try {
    lines = JSON.parse(values.lines || "[]");
  } catch {
    return { errors: { lines: DOC_ERRORS.bad_lines.message }, values };
  }

  // A quote's deposit: at least £1, at most the total (checked here first, so a refused one saves nothing).
  let deposit: number | null = null;
  if (values.kind === "quote" && values.deposit.trim()) {
    deposit = parsePence(values.deposit);
    const total = Array.isArray(lines) ? docTotal(lines as DocLine[]) : 0;
    if (deposit === null || deposit < 100 || deposit > total) return { errors: { deposit: DOC_ERRORS.bad_deposit.message }, values };
  }

  const { data, error } = await supabase.rpc("save_my_doc", {
    p_provider: values.provider_id,
    p_doc: {
      id: values.id || null,
      kind: values.kind,
      customer_name: values.customer_name,
      customer_phone: phone,
      customer_email: values.customer_email.trim() || null,
      title: values.title,
      lines,
      notes: values.notes,
      until: values.until || null,
      // Only an invoice has the tick box; a quote keeps the default (yes), which its invoice copies.
      ask_review: values.kind === "invoice" ? values.ask_review === "on" : null,
      job_request_id: ID_PATTERN.test(values.job_request_id) ? values.job_request_id : null,
    },
  });
  if (error) return refused("save_my_doc", error.message, values);
  if (values.kind === "quote") {
    const { error: e } = await supabase.rpc("set_my_quote_deposit", { p_doc: String(data), p_pence: deposit });
    if (e) return refused("set_my_quote_deposit", e.message, { ...values, id: String(data) });
  }
  revalidatePath(platformPath("provider"));
  redirect(platformPath("provider", "docs", String(data)));
}

/**
 * Marks a quote sent, or an invoice paid, unpaid or cancelled. Paid: the customer is asked for a review (if the
 * invoice says so), after the response.
 */
export async function markDoc(docId: string, action: "sent" | "paid" | "unpaid" | "void" | "invoice_sent"): Promise<{ ok: boolean }> {
  const { supabase } = await requireMember(platformPath("provider"));
  if (!ID_PATTERN.test(docId)) return { ok: false };
  const { error } = await supabase.rpc("set_my_doc_status", { p_doc: docId, p_action: action });
  if (error) {
    console.error("docs: set_my_doc_status failed:", error.message);
    return { ok: false };
  }
  if (action === "paid") after(() => deliverCustomerMessage("review_request", docId));
  revalidatePath(platformPath("provider", "docs", docId));
  revalidatePath(platformPath("provider"));
  return { ok: true };
}

/** An accepted quote becomes an invoice (due in 14 days); opens it. */
export async function makeInvoice(quoteId: string): Promise<{ ok: false; message: string } | never> {
  const { supabase } = await requireMember(platformPath("provider"));
  if (!ID_PATTERN.test(quoteId)) return { ok: false, message: FAILED };
  const { data, error } = await supabase.rpc("invoice_from_quote", { p_quote: quoteId });
  if (error) {
    const known = DOC_ERRORS[error.message];
    if (!known) console.error("docs: invoice_from_quote failed:", error.message);
    return { ok: false, message: known?.message ?? FAILED };
  }
  revalidatePath(platformPath("provider"));
  redirect(platformPath("provider", "docs", String(data)));
}

/** Emails the customer their copy (needs an email address on it). */
export async function emailDoc(docId: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireMember(platformPath("provider"));
  if (!ID_PATTERN.test(docId)) return { ok: false, message: FAILED };
  // Checks it's the caller's (and marks a quote sent: it's on its way).
  const { data, error } = await supabase.rpc("my_doc", { p_doc: docId });
  if (error || !data) return { ok: false, message: FAILED };
  const doc = (data as { doc: { kind: string; status: string; customer_email: string | null } }).doc;
  if (!doc.customer_email) return { ok: false, message: "Add the customer's email address first." };
  if (doc.kind === "quote" && doc.status === "draft") {
    const { error: e } = await supabase.rpc("set_my_doc_status", { p_doc: docId, p_action: "sent" });
    if (e) return { ok: false, message: FAILED };
  } else if (doc.kind === "invoice") {
    await supabase.rpc("set_my_doc_status", { p_doc: docId, p_action: "invoice_sent" });
  }
  const sent = await deliverCustomerMessage("doc_email", docId);
  revalidatePath(platformPath("provider", "docs", docId));
  return sent > 0
    ? { ok: true, message: `Emailed to ${doc.customer_email}.` }
    : { ok: false, message: "It's already been emailed once. Send the link on WhatsApp instead." };
}

const BILLING_ERRORS: Record<string, { field: string; message: string }> = {
  bad_account_name: { field: "account_name", message: "Enter the name on the account." },
  bad_sort_code: { field: "sort_code", message: "Enter the 6-digit sort code, like 12-34-56." },
  bad_account_number: { field: "account_number", message: "Enter the 8-digit account number." },
};

/** The bank details printed on invoices. */
export async function saveBilling(providerId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember(platformPath("provider"));
  const values = { account_name: text(fd, "account_name"), sort_code: text(fd, "sort_code"), account_number: text(fd, "account_number") };
  if (!ID_PATTERN.test(providerId)) return { message: FAILED, values };
  const { error } = await supabase.rpc("set_my_billing", {
    p_provider: providerId,
    p_account_name: values.account_name,
    p_sort_code: values.sort_code,
    p_account_number: values.account_number,
  });
  if (error) {
    const known = BILLING_ERRORS[error.message];
    if (!known) return refused("set_my_billing", error.message, values);
    return { errors: { [known.field]: known.message }, values };
  }
  revalidatePath(platformPath("provider"));
  return { ok: true, message: "Saved. They'll show on your invoices.", values };
}
