import { NextResponse } from "next/server";
import { isLinkPreviewBot } from "@/lib/bots";
import { clientIpFrom } from "@/lib/client-ip";
import { ipHash } from "@/lib/ip-hash";
import { rateAllow } from "@/lib/rate-limit";
import { searchLogLine } from "@/lib/search-log";

export const dynamic = "force-dynamic";

const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// Home search beacon: one cleaned JSON line per search in the server log. Always 204, so a failure never shows.
export async function POST(request: Request) {
  if (isLinkPreviewBot(request.headers.get("user-agent") ?? "")) return done();
  const text = await request.text().catch(() => "");
  if (text.length > 500) return done();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const line = searchLogLine(body);
  // At most 60 logged searches an hour per connection, so nobody can flood the log or skew the search report.
  if (line && (await rateAllow("search-log", ipHash(clientIpFrom(request.headers) || "unknown"), 60, 3600, false))) {
    console.log(JSON.stringify(line));
  }
  return done();
}
