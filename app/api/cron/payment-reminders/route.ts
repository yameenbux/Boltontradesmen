import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverCustomerMessage, type CustomerMessage } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Payment reminders for Pro traders' unpaid invoices: the first 3 days after the due date, the second a week later
// (due_payment_reminders decides; the alert log stops repeats). Run once a day by a Railway cron service:
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://boltonvouched.ysbdesigns.uk/api/cron/payment-reminders
// Without CRON_SECRET set, it refuses everything.

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!authorised(request.headers.get("authorization"), process.env.CRON_SECRET?.trim())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const { data, error } = await createServiceClient().rpc("due_payment_reminders");
  if (error) {
    console.error("cron: due_payment_reminders failed:", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const due = (data ?? []) as { id: string; kind: CustomerMessage }[];
  let sent = 0;
  for (const d of due) sent += await deliverCustomerMessage(d.kind, d.id);
  console.log(JSON.stringify({ cron: "payment-reminders", due: due.length, sent }));
  return NextResponse.json({ due: due.length, sent }, { headers: { "Cache-Control": "no-store" } });
}
