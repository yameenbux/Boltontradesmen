import "server-only";
import { timingSafeEqual } from "node:crypto";
import { deliverCustomerMessage, type CustomerMessage } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/service";

// The scheduled jobs' shared pieces: the bearer check, and the daily work itself.

export function cronAuthorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
}

type Due = { id: string; kind: CustomerMessage }[];

/** Sends what a list function says is due (the alert log stops repeats). Returns {due, sent}, or throws. */
export async function sendDue(fn: "due_payment_reminders" | "due_quote_followups"): Promise<{ due: number; sent: number }> {
  const { data, error } = await createServiceClient().rpc(fn);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  const due = (data ?? []) as Due;
  let sent = 0;
  for (const d of due) sent += await deliverCustomerMessage(d.kind, d.id);
  return { due: due.length, sent };
}

/** Deletes page view counts past their 13 months. Returns how many days went. */
export async function purgePageViews(): Promise<number> {
  const { data, error } = await createServiceClient().rpc("purge_old_page_views");
  if (error) throw new Error(`purge_old_page_views failed: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
