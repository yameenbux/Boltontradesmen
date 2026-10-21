import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIpFrom } from "@/lib/client-ip";
import { deviceHash } from "@/lib/device-hash";
import { ipHash, rateLimitKey } from "@/lib/ip-hash";
import { rateAllow } from "@/lib/rate-limit";
import { isLinkPreviewBot } from "@/lib/bots";
import { tapActor } from "@/lib/tap-actor";

export const dynamic = "force-dynamic";

// Each connection can open this many call or WhatsApp links an hour: plenty for anyone ringing round, far too few to
// scrape every trader's number from the sitemap.
const REVEALS_PER_HOUR = 60;

type Numbers = { phone_e164: string; whatsapp_e164: string | null };

// HEAD requests (link checkers, prefetchers) never log a tap and never reveal a number.
export async function HEAD() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const via = new URL(request.url).searchParams.get("via");
  if (via !== "call" && via !== "whatsapp") {
    return new NextResponse("Bad request", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const ip = clientIpFrom(request.headers) ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const headers = { "Cache-Control": "no-store" };

  // Link previews and crawlers are not enquiries and get no number: the trader's page instead.
  if (isLinkPreviewBot(ua)) {
    return NextResponse.redirect(new URL(`/p/${encodeURIComponent(slug)}`, request.url), { status: 302, headers });
  }
  if (!(await rateAllow("contact", ipHash(ip || "unknown"), REVEALS_PER_HOUR, 3600, true))) {
    return new NextResponse("Too many requests. Please try again later.", { status: 429, headers: { ...headers, "Retry-After": "3600" } });
  }

  const supabase = createServiceClient();
  let numbers: Numbers | null = null;
  try {
    const { data, error } = await supabase.rpc("log_contact", {
      p_slug: slug,
      p_type: via === "call" ? "call_tap" : "whatsapp_tap",
      // A signed-in tapper's id, so the trader's own taps and the admin's don't count as enquiries.
      p_actor: await tapActor(request.headers.get("cookie")),
      // One enquirer per connection, not per browser: a changed user agent doesn't count again.
      p_device_hash: deviceHash(rateLimitKey(ip), ""),
    });
    if (error) throw error;
    numbers = (data as Numbers[] | null)?.[0] ?? null;
  } catch (err) {
    console.error("log_contact failed; falling back to direct lookup", err);
    try {
      const { data } = await supabase
        .from("providers")
        .select("phone_e164, whatsapp_e164")
        .eq("slug", slug)
        .eq("status", "live")
        .maybeSingle();
      numbers = (data as Numbers | null) ?? null;
    } catch (err2) {
      console.error("fallback phone lookup failed", err2);
    }
  }

  if (!numbers) return new NextResponse("Not found", { status: 404, headers });

  let target: string;
  if (via === "call") {
    target = `tel:${numbers.phone_e164}`;
  } else {
    if (!numbers.whatsapp_e164) return new NextResponse("Not found", { status: 404, headers });
    target = `https://wa.me/${numbers.whatsapp_e164.replace(/\D/g, "")}`;
  }
  return new NextResponse(null, { status: 302, headers: { ...headers, Location: target } });
}
