import { NextResponse } from "next/server";
import { cronAuthorised, purgePageViews, sendDue } from "@/lib/cron";

export const dynamic = "force-dynamic";

// The daily job: payment reminders on overdue invoices, follow-ups on unanswered quotes (both Pro), and clearing
// page view counts past 13 months. Each part runs even if another fails. Run once a day (late morning, Bolton time):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.boltonvouched.co.uk/api/cron/daily
// Without CRON_SECRET set, it refuses everything.
export async function GET(request: Request) {
  if (!cronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET?.trim())) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const out: Record<string, unknown> = {};
  let failed = false;
  const run = async (name: string, job: () => Promise<unknown>) => {
    try {
      out[name] = await job();
    } catch (err) {
      failed = true;
      out[name] = "failed";
      console.error(`cron daily: ${name}:`, err instanceof Error ? err.message : err);
    }
  };
  await run("payment_reminders", () => sendDue("due_payment_reminders"));
  await run("quote_followups", () => sendDue("due_quote_followups"));
  await run("purged_view_days", () => purgePageViews());
  console.log(JSON.stringify({ cron: "daily", ...out }));
  return NextResponse.json(out, { status: failed ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
