import { siteUrl } from "@/lib/seo";
import { spotlightText } from "@/lib/spotlight";
import { spotlightInput } from "@/lib/spotlight-data";

// The trader's Facebook spotlight post (lib/spotlight.ts), as plain text for the daily job that drafts it in
// Metricool. Public: it says only what the listing page already says. 404 when there's no live listing.
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const p = await spotlightInput((await params).slug);
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(spotlightText(p, siteUrl()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
