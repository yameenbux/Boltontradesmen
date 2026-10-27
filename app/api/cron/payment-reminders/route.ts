import { NextResponse } from "next/server";
import { cronAuthorised, sendDue } from "@/lib/cron";

export const dynamic = "force-dynamic";

// Payment reminders only (kept for an existing schedule; /api/cron/daily does this and the rest). Needs CRON_SECRET:
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.boltonvouched.co.uk/api/cron/payment-reminders
export async function GET(request: Request) {
  if (!cronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET?.trim())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    const r = await sendDue("due_payment_reminders");
    console.log(JSON.stringify({ cron: "payment-reminders", ...r }));
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("cron:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
