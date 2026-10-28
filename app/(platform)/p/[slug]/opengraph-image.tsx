import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { BADGE_COLOURS, badgeName, STAR_PATH, textWidth } from "@/lib/badge-image";
import { BADGE_LABEL, ratingBadge } from "@/lib/badges";
import { BRAND_MARK } from "@/lib/brand-mark";
import { getProvider, listCategoryGroups } from "@/lib/directory";
import { imageFonts } from "@/lib/og-fonts";
import { displayLink } from "@/lib/review-link";
import { coverage, leadTrades, SITE_NAME, siteUrl, stripPhoneNumbers } from "@/lib/seo";

// The profile's social preview (WhatsApp, Facebook, X): brand, business name, trade and areas, plus the rating badge
// and "would use again" figure once earned. Never a phone number. Cached like the page itself and refreshed on the
// same schedule.
export const revalidate = 300;
export const alt = `A listing on ${SITE_NAME}, recommended by local people in Bolton`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return [];
}

const C = { ...BADGE_COLOURS, bg: "#F5EEE3", hero: "#8C3220" };
const NAME_ROOM = 1040;

/** The largest size from 96px down that keeps the name to two lines. */
function nameSize(name: string): number {
  for (const s of [96, 88, 80, 72, 64, 56]) if (textWidth(name, s) <= NAME_ROOM * 1.8) return s;
  return 52;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProvider((await params).slug);
  if (!p) notFound();
  const names = new Map(
    (await listCategoryGroups()).flatMap(({ categories }) => categories.map((c) => [c.slug, c.name] as const)),
  );
  const all = p.categorySlugs.flatMap((s) => names.get(s) ?? []);
  const trade = all.length ? leadTrades(all, p.businessName).join(" · ") : "Local pro";
  const badge = ratingBadge(p);
  const useAgain = p.reviewCount >= 3 && p.useAgainPct !== null ? p.useAgainPct : null;
  const name = badgeName(p.businessName);
  const where = p.areas.length ? `Covers ${coverage(p.areas)}` : "Bolton";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          fontFamily: "Figtree",
          color: C.ink,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 80px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 72,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: C.brick,
                borderRadius: 20,
              }}
            >
              <svg
                width={48}
                height={48}
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
            <div style={{ fontFamily: "Gloock", fontSize: 40 }}>{SITE_NAME}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            <div
              style={{
                fontFamily: "Gloock",
                fontSize: nameSize(name),
                lineHeight: 1.04,
                letterSpacing: -1,
                maxWidth: NAME_ROOM,
                lineClamp: 2,
              }}
            >
              {name}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 36,
                fontWeight: 600,
                color: C.ink2,
                maxWidth: NAME_ROOM,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {stripPhoneNumbers(`${trade} · ${where}`)}
            </div>
            {(badge || useAgain !== null) && (
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 34 }}>
                {badge && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 24px 10px 18px",
                      borderRadius: 999,
                      fontSize: 32,
                      fontWeight: 700,
                      color: badge === "top" ? C.goldInk : C.ink2,
                      background: badge === "top" ? "#F2E6CF" : "transparent",
                      border: `3px solid ${badge === "top" ? "#D9BF8C" : "#D6C2A0"}`,
                    }}
                  >
                    <svg width={30} height={30} viewBox="0 0 24 24">
                      <path d={STAR_PATH} fill={C.gold} />
                    </svg>
                    {BADGE_LABEL[badge]}
                  </div>
                )}
                {useAgain !== null && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 32, fontWeight: 600 }}>
                    <span style={{ fontFamily: "Gloock", fontSize: 52, color: C.brick }}>{useAgain}%</span>
                    <span style={{ color: C.ink2 }}>would use again</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 84,
            padding: "0 80px",
            background: C.hero,
            color: C.onBrick,
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          <span>Recommended by local people</span>
          <span style={{ opacity: 0.85 }}>{displayLink(siteUrl())}</span>
        </div>
      </div>
    ),
    { ...size, fonts: await imageFonts() },
  );
}
