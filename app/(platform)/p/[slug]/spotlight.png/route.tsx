import { ImageResponse } from "next/og";
import { textWidth } from "@/lib/badge-image";
import { brandMarkSvg } from "@/lib/brand-mark";
import { imageFonts } from "@/lib/og-fonts";
import { displayLink } from "@/lib/review-link";
import { SITE_NAME, siteUrl } from "@/lib/seo";
import { spotlightFacts } from "@/lib/spotlight";
import { spotlightInput, spotlightLogo } from "@/lib/spotlight-data";

// The trader's Facebook spotlight image (1080x1350, the tallest a Facebook feed shows): brand, "Trader spotlight",
// their logo if they have one, name, trades and the ticked facts from lib/spotlight.ts, over the Bolton skyline. The
// daily job hands this address to Metricool with the post. Never a phone number. 404 when there's no live listing.
export const revalidate = 300;

const W = 1080;
const H = 1350;
const C = { ink: "#231A15", brick: "#9C3A25", onBrick: "#FFF5E9", dark: "#8C3220", window: "#F2C24F" };
const NAME_ROOM = 900;

const svgSrc = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// The skyline from the Facebook cover: mills, a terrace, the town hall clock tower, twice across.
function skyline(): string {
  let win = "";
  const grid = (x0: number, y0: number, c: number, r: number, dx: number, dy: number) => {
    for (let j = 0; j < r; j++)
      for (let i = 0; i < c; i++)
        if ((j * 7 + i * 3) % 5 !== 0) win += `<rect x="${x0 + i * dx}" y="${y0 + j * dy}" width="9" height="12" rx="1"/>`;
  };
  grid(42, 104, 7, 4, 21, 23);
  grid(602, 96, 7, 4, 23, 25);
  const one =
    `<g fill="${C.dark}"><polygon points="30,200 30,92 200,92 200,200"/><polygon points="168,92 172,8 186,8 190,92"/>` +
    `<path d="M210 200 V150 L235 130 L260 150 L285 130 L310 150 L335 130 L360 150 L380 136 V200 Z"/>` +
    `<rect x="400" y="110" width="160" height="90"/><rect x="455" y="34" width="50" height="76"/>` +
    `<path d="M455 34 Q480 -2 505 34 Z"/><rect x="478" y="-14" width="4" height="22"/>` +
    `<path d="M590 200 V82 L620 66 V82 L650 66 V82 L680 66 V82 L710 66 V82 L770 82 V200 Z"/>` +
    `<polygon points="740,82 744,-6 758,-6 762,82"/><circle cx="480" cy="66" r="12" fill="#F5D9A8"/></g>` +
    `<g fill="${C.window}">${win}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 1640 220" width="${W}" height="${Math.round((W * 220) / 1640)}">` +
    `${one}<g transform="translate(800 0)">${one}</g></svg>`
  );
}

const TICK =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${C.onBrick}" ` +
  `stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;

/** The largest size from 104px down that keeps the name to two lines. */
function nameSize(name: string): number {
  for (const s of [104, 96, 88, 80, 72, 64]) if (textWidth(name, s) <= NAME_ROOM * 1.8) return s;
  return 56;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const p = await spotlightInput((await params).slug);
  if (!p) return new Response("Not found", { status: 404 });
  const f = spotlightFacts(p);
  const logo = await spotlightLogo(p.logoPath);
  const sky = skyline();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "linear-gradient(180deg, #FBE9D7 0%, #F6D3B2 60%, #EDAE87 100%)",
          fontFamily: "Figtree",
          color: C.ink,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgSrc(sky)} width={W} height={Math.round((W * 220) / 1640)} alt="" style={{ position: "absolute", left: 0, bottom: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "96px 90px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "Gloock", fontSize: 38 }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 18,
                  background: C.brick,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgSrc(brandMarkSvg(C.onBrick, 38))} width={38} height={38} alt="" />
              </div>
              {SITE_NAME}
            </div>
            <div
              style={{
                display: "flex",
                background: C.brick,
                color: C.onBrick,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: 2,
                padding: "12px 22px",
                borderRadius: 999,
              }}
            >
              TRADER SPOTLIGHT
            </div>
          </div>

          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              width={150}
              height={150}
              alt=""
              style={{ marginTop: 64, borderRadius: 28, objectFit: "cover", background: "#FFFBF5", border: "4px solid #FFFBF5" }}
            />
          )}
          <div
            style={{
              marginTop: logo ? 36 : 84,
              fontFamily: "Gloock",
              fontSize: nameSize(f.name),
              lineHeight: 1,
              letterSpacing: -1,
              maxWidth: NAME_ROOM,
              lineClamp: 2,
            }}
          >
            {f.name}
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 40, fontWeight: 700, color: C.brick }}>{f.tradeLine}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: logo ? 44 : 60 }}>
            {f.lines.map((l) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 36, fontWeight: 600 }}>
                <div
                  style={{
                    display: "flex",
                    flex: "none",
                    width: 54,
                    height: 54,
                    borderRadius: 999,
                    background: C.brick,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={svgSrc(TICK)} width={30} height={30} alt="" />
                </div>
                <span style={{ maxWidth: 800 }}>{l}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: 56 }}>
            <div
              style={{
                display: "flex",
                background: C.ink,
                color: C.onBrick,
                fontWeight: 700,
                fontSize: 34,
                padding: "20px 34px",
                borderRadius: 999,
              }}
            >
              {displayLink(siteUrl())}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await imageFonts() },
  );
}
