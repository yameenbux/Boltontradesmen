import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deviceHash } from "@/lib/device-hash";

export const dynamic = "force-dynamic";

type Numbers = { phone_e164: string; whatsapp_e164: string | null };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const via = new URL(request.url).searchParams.get("via");
  if (via !== "call" && via !== "whatsapp") {
    return new NextResponse("Bad request", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = request.headers.get("user-agent") ?? "";
  const supabase = createServiceClient();

  let numbers: Numbers | null = null;
  try {
    const { data, error } = await supabase.rpc("log_contact", {
      p_slug: slug,
      p_type: via === "call" ? "call_tap" : "whatsapp_tap",
      p_actor: null, // resident auth arrives in Plan 2
      p_device_hash: deviceHash(ip, ua),
    });
    if (error) throw error;
    const row = (data as Numbers[] | null)?.[0];
    numbers = row ?? null;
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
