import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIpFrom } from "@/lib/client-ip";
import { deviceHash } from "@/lib/device-hash";
import { isLinkPreviewBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

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
  const supabase = createServiceClient();

  let numbers: Numbers | null = null;
  const lookupDirectly = async () => {
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
  };

  if (isLinkPreviewBot(ua)) {
    // Link previews and crawlers are not enquiries: redirect without logging.
    await lookupDirectly();
  } else {
    try {
      const { data, error } = await supabase.rpc("log_contact", {
        p_slug: slug,
        p_type: via === "call" ? "call_tap" : "whatsapp_tap",
        p_actor: null, // taps are not attributed to signed-in people until Plan 4's enquiry stats
        p_device_hash: deviceHash(ip, ua),
      });
      if (error) throw error;
      const row = (data as Numbers[] | null)?.[0];
      numbers = row ?? null;
    } catch (err) {
      console.error("log_contact failed; falling back to direct lookup", err);
      await lookupDirectly();
    }
  }

  const headers = { "Cache-Control": "no-store" };
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
