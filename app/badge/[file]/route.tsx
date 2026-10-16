import { ImageResponse } from "next/og";
import {
  BADGE_COLOURS as C,
  BADGE_KICKER,
  BADGE_LAYOUT,
  BADGE_TEXT_ROOM,
  badgeLine,
  badgeName,
  badgeSvg,
  fitName,
  STAR_PATH,
} from "@/lib/badge-image";
import { ratingBadge, type RatingBadge } from "@/lib/badges";
import { BRAND_MARK } from "@/lib/brand-mark";
import { getProvider } from "@/lib/directory";
import { imageFonts } from "@/lib/og-fonts";
import { BADGE_HEIGHT, BADGE_PNG_SCALE, BADGE_WIDTH, parseBadgeFile } from "@/lib/share";

// The "Vouched in Bolton" website badge, /badge/<slug>.svg (for traders' websites) and /badge/<slug>.png (for
// Facebook, vans and print). Other sites load it, so it's public, cookie-free (not in proxy.ts's matcher) and cached
// for an hour; a badge earned or lost shows within the hour. Live providers only: anything else is a 404.
export const revalidate = 3600;

// None at build time; each is rendered on first request, then cached.
export function generateStaticParams() {
  return [];
}

const CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const parsed = parseBadgeFile((await params).file);
  if (!parsed) return notFound();
  const p = await getProvider(parsed.slug);
  if (!p) return notFound();
  const badge = ratingBadge(p);

  if (parsed.format === "svg") {
    return new Response(badgeSvg({ businessName: p.businessName, badge }), {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
    });
  }
  return new ImageResponse(<BadgePng businessName={p.businessName} badge={badge} />, {
    width: BADGE_WIDTH * BADGE_PNG_SCALE,
    height: BADGE_HEIGHT * BADGE_PNG_SCALE,
    fonts: await imageFonts(),
    headers: { "Cache-Control": CACHE },
  });
}

/** The same badge drawn for ImageResponse (flexbox only), at BADGE_PNG_SCALE times the SVG's size. */
function BadgePng({ businessName, badge }: { businessName: string; badge: RatingBadge | null }) {
  const s = BADGE_PNG_SCALE;
  const { pad, tile, gap, end, radius } = BADGE_LAYOUT;
  const name = fitName(badgeName(businessName), BADGE_TEXT_ROOM);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: `0 ${end * s}px 0 ${pad * s}px`,
        gap: gap * s,
        background: C.surface,
        border: `${s}px solid ${C.line}`,
        borderRadius: radius * s,
      }}
    >
      <div
        style={{
          width: tile * s,
          height: tile * s,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.brick,
          borderRadius: (radius - 2) * s,
        }}
      >
        <svg
          width={tile * 0.66 * s}
          height={tile * 0.66 * s}
          viewBox={BRAND_MARK.viewBox}
          fill="none"
          stroke={C.onBrick}
          strokeWidth={BRAND_MARK.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {BRAND_MARK.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: BADGE_TEXT_ROOM * s }}>
        <div
          style={{
            fontFamily: "Figtree",
            fontWeight: 700,
            fontSize: 10 * s,
            letterSpacing: 1.1 * s,
            color: C.brick,
            lineHeight: 1.2,
          }}
        >
          {BADGE_KICKER.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: "Gloock",
            fontSize: name.size * s,
            color: C.ink,
            lineHeight: 1.25,
            marginTop: 2 * s,
            // fitName has already sized or shortened it to fit on one line.
            whiteSpace: "nowrap",
          }}
        >
          {name.text}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 * s, marginTop: 3 * s }}>
          {badge && (
            <svg width={12 * s} height={12 * s} viewBox="0 0 24 24">
              <path d={STAR_PATH} fill={C.gold} />
            </svg>
          )}
          <div
            style={{
              fontFamily: "Figtree",
              fontWeight: 700,
              fontSize: 12 * s,
              color: badge === "top" ? C.goldInk : C.ink2,
              lineHeight: 1.2,
            }}
          >
            {badgeLine(badge)}
          </div>
        </div>
      </div>
    </div>
  );
}
