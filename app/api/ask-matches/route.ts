import { NextResponse } from "next/server";
import { listProvidersInCategory } from "@/lib/directory";
import { BL_DISTRICTS } from "@/lib/districts";
import { askMatches } from "@/lib/ask-matches";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The Ask form's "already listed" panel: the top live traders in a trade who cover an area. Public data only (the
// same as the category page), so it can be cached briefly.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "";
  const district = (url.searchParams.get("district") ?? "").toUpperCase();
  if (!SLUG.test(category) || !BL_DISTRICTS.includes(district)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const lists = await listProvidersInCategory(category, district);
  return NextResponse.json(askMatches(lists), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60", "X-Robots-Tag": "noindex" },
  });
}
