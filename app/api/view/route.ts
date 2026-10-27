import { NextResponse } from "next/server";
import { isLinkPreviewBot } from "@/lib/bots";
import { clientIpFrom } from "@/lib/client-ip";
import { deviceHash } from "@/lib/device-hash";
import { rateLimitKey } from "@/lib/ip-hash";
import { createServiceClient } from "@/lib/supabase/service";
import { tapActor } from "@/lib/tap-actor";
import { viewBody } from "@/lib/page-views";

export const dynamic = "force-dynamic";

const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// Page view beacon (components/ViewBeacon.tsx): one view per connection per page per Bolton day (record_page_view,
// migration 000053). The trader's own views and the admin's are left out by the signed-in id, like enquiries.
// Crawlers and headless browsers don't count. Always 204, so a failure never shows.
export async function POST(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || isLinkPreviewBot(ua) || /bot|crawl|spider|headless|preview|lighthouse/i.test(ua)) return done();
  const text = await request.text().catch(() => "");
  if (text.length > 200) return done();
  const body = viewBody(text);
  if (!body) return done();
  try {
    const { error } = await createServiceClient().rpc("record_page_view", {
      p_kind: body.kind,
      p_ref: body.slug,
      p_viewer: deviceHash(rateLimitKey(clientIpFrom(request.headers) ?? ""), ""),
      p_actor: await tapActor(request.headers.get("cookie")),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("view: record_page_view failed", err instanceof Error ? err.message : err);
  }
  return done();
}
