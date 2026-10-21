"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { clientIpFrom } from "@/lib/client-ip";
import { filledTooFast } from "@/lib/form-timing";
import { ipHash } from "@/lib/ip-hash";
import { JOB_ERRORS, JOB_FIELDS, sentPath, type JobFormState } from "@/lib/job-request";
import { parseJobRequest } from "@/lib/job-request-parse";
import { HONEYPOT_FIELD, STARTED_FIELD } from "@/lib/listing-request";
import { deliverJobRequestAlerts } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/service";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

// "Request a quote" on a Pro trader's page. Public and cookie-free like "Get listed": the same spam checks, cheapest
// first (honeypot and fill time, then the fields, Turnstile, then the database's limits). The trader is told by email (and text, once texts are switched on)
// and email after the response, so the resident never waits on Twilio or Resend.

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export async function requestJob(slug: string, _prev: JobFormState, fd: FormData): Promise<JobFormState> {
  if (field(fd, HONEYPOT_FIELD).trim() || filledTooFast(field(fd, STARTED_FIELD))) redirect(sentPath(slug));

  const values: Record<string, string> = {};
  for (const k of JOB_FIELDS) values[k] = field(fd, k);

  const parsed = parseJobRequest(fd);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const ip = clientIpFrom(await headers()) ?? "unknown";
  const human = await verifyTurnstile(field(fd, TURNSTILE_FIELD), ip);
  if (!human.ok) {
    const message = human.reason === "missing" || human.reason === "rejected" ? JOB_ERRORS.captcha : JOB_ERRORS.failed;
    return { message, values };
  }

  let verdict: { result?: string; id?: string };
  try {
    const r = parsed.data;
    const { data, error } = await createServiceClient().rpc("submit_job_request", {
      p_slug: slug,
      p_name: r.name,
      p_phone_e164: r.phone_e164,
      p_email: r.email,
      p_district: r.district,
      p_body: r.body,
      p_ip_hash: ipHash(ip),
    });
    if (error) throw new Error(`submit_job_request: ${error.message}`);
    verdict = (data ?? {}) as typeof verdict;
  } catch (err) {
    console.error("request a quote: saving the request failed:", err);
    return { message: JOB_ERRORS.failed, values };
  }
  if (verdict.result === "limited") return { message: JOB_ERRORS.limited, values };
  if (verdict.result === "unavailable") return { message: JOB_ERRORS.unavailable, values };
  if (verdict.result !== "ok" || !verdict.id) {
    console.error("request a quote: submit_job_request answered", verdict);
    return { message: JOB_ERRORS.failed, values };
  }
  const id = verdict.id;
  after(() => deliverJobRequestAlerts(id));
  redirect(sentPath(slug));
}
