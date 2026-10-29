import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// For the uptime monitor: 200 when the site can read the database (one row of the trade list), 503 when it can't.
// Says nothing else, so it's safe to leave public.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { error } = await createPublicClient().from("categories").select("slug").limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("health: database check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
