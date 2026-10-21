"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/admin-shared";
import { requireMember } from "@/lib/auth";
import { JOB_STATUSES, type JobStatus } from "@/lib/job-request";
import { platformPath } from "@/lib/paths";
import { ID_PATTERN } from "@/lib/review-form";
import { InvalidPhoneError, toE164 } from "@/lib/phone";

// The trader's side of Pro's job requests and alerts. The database checks the listing is the caller's.

/** Marks one job request (new, contacted, won, didn't go ahead, spam). */
export async function setJobRequestStatus(requestId: string, status: JobStatus): Promise<{ ok: boolean }> {
  const { supabase } = await requireMember(platformPath("provider"));
  if (!ID_PATTERN.test(requestId) || !JOB_STATUSES.includes(status)) return { ok: false };
  const { error } = await supabase.rpc("set_my_job_request_status", { p_request: requestId, p_status: status });
  if (error) {
    console.error("provider: set_my_job_request_status failed:", error.message);
    return { ok: false };
  }
  revalidatePath(platformPath("provider"));
  return { ok: true };
}

const ALERT_ERRORS: Record<string, { field?: "sms" | "email"; message: string }> = {
  bad_mobile: { field: "sms", message: "Enter a UK mobile number, like 07700 900123, or leave it empty." },
  bad_email: { field: "email", message: "Enter an email address like name@example.com, or leave it empty." },
};

/** Where alerts go: a mobile and an email (empty = the defaults), and which are on. */
export async function saveAlertSettings(providerId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember(platformPath("provider"));
  const text = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
  const on = (k: string) => fd.get(k) === "on";
  const values = { sms: text("sms"), email: text("email") };
  if (!ID_PATTERN.test(providerId)) return { message: "Something went wrong. Please try again.", values };

  let sms: string | null = null;
  if (values.sms.trim()) {
    try {
      sms = toE164(values.sms);
    } catch (err) {
      if (!(err instanceof InvalidPhoneError)) throw err;
      return { errors: { sms: ALERT_ERRORS.bad_mobile.message }, values };
    }
    if (!/^\+447/.test(sms)) return { errors: { sms: ALERT_ERRORS.bad_mobile.message }, values };
  }
  const { error } = await supabase.rpc("set_my_alert_settings", {
    p_provider: providerId,
    p_sms: sms,
    p_email: values.email.trim() || null,
    p_sms_on: on("sms_on"),
    p_email_on: on("email_on"),
    p_question_alerts: on("question_alerts"),
  });
  if (error) {
    const known = ALERT_ERRORS[error.message];
    if (!known) {
      console.error("provider: set_my_alert_settings failed:", error.message);
      return { message: "Something went wrong. Please try again.", values };
    }
    return known.field ? { errors: { [known.field]: known.message }, values } : { message: known.message, values };
  }
  revalidatePath(platformPath("provider"));
  return { ok: true, message: "Saved.", values };
}
