// The "Vouched in Bolton" website badge as an SVG string (app/badge/[file]/route.tsx), plus the text and sizing it
// shares with the PNG version. Pure, so it can be unit tested. The SVG is shown by other sites in an <img>, where it
// can't load fonts or anything else, so it uses system fonts and carries its own light background: it reads the same
// on a white page, a dark page or a Facebook post.
import { BADGE_LABEL, type RatingBadge } from "@/lib/badges";
import { BRAND_MARK } from "@/lib/brand-mark";
import { BADGE_HEIGHT, BADGE_WIDTH, badgeAlt, escapeMarkup } from "@/lib/share";
import { stripPhoneNumbers } from "@/lib/seo";

/** Light-theme brand tokens (app/globals.css). The badge never switches theme. */
export const BADGE_COLOURS = {
  surface: "#FFFBF5",
  line: "#E4D6C5",
  ink: "#231A15",
  ink2: "#6B5D53",
  brick: "#9C3A25",
  onBrick: "#FFF5E9",
  gold: "#B5862C",
  /** Gold mixed half with ink, as the "Top rated" pill's text (.pill-top): 7:1 on the surface. */
  goldInk: "#6C5020",
} as const;

export const BADGE_KICKER = "Vouched in Bolton";
export const BADGE_LISTED = "Listed on Bolton Vouched";

/** The third line: the earned badge, or the plain listing line. */
export function badgeLine(badge: RatingBadge | null): string {
  return badge ? BADGE_LABEL[badge] : BADGE_LISTED;
}

/** The name as the badge shows it: trimmed, and never anything that reads as a phone number. */
export function badgeName(businessName: string): string {
  return stripPhoneNumbers(businessName.replace(/\s+/g, " ").trim());
}

// Rough advance widths (in em) for a bold-ish sans or a serif display face: enough to pick a size that fits.
function charWidth(c: string): number {
  if (/[iljtfr.,:;'’!|\s]/.test(c)) return 0.32;
  if (/[MW@]/.test(c)) return 0.9;
  if (/[mw]/.test(c)) return 0.8;
  if (/[A-Z&]/.test(c)) return 0.68;
  if (/[0-9]/.test(c)) return 0.56;
  return 0.54;
}

/** Estimated width of `text` at `size` px. */
export function textWidth(text: string, size: number): number {
  return [...text].reduce((w, c) => w + charWidth(c), 0) * size;
}

const NAME_MAX = 17;
const NAME_MIN = 11.5;

/**
 * Font size for the business name in `room` px: the largest from 17px down to 11.5px that fits, else 11.5px with the
 * name cut short and an ellipsis.
 */
export function fitName(name: string, room: number): { text: string; size: number } {
  for (let size = NAME_MAX; size >= NAME_MIN; size -= 0.5) {
    if (textWidth(name, size) <= room) return { text: name, size };
  }
  let text = name;
  while (text.length > 1 && textWidth(`${text}…`, NAME_MIN) > room) text = text.slice(0, -1);
  return { text: `${text.trimEnd()}…`, size: NAME_MIN };
}

/** Layout shared by the SVG and the PNG, in SVG pixels (the PNG multiplies by its scale). */
export const BADGE_LAYOUT = { pad: 12, tile: 50, gap: 10, end: 10, radius: 14 } as const;
export const BADGE_TEXT_X = BADGE_LAYOUT.pad + BADGE_LAYOUT.tile + BADGE_LAYOUT.gap;
export const BADGE_TEXT_ROOM = BADGE_WIDTH - BADGE_TEXT_X - BADGE_LAYOUT.end;

export const STAR_PATH = "m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z";

const SANS = "Figtree, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Gloock, 'Iowan Old Style', Georgia, 'Times New Roman', serif";

/** The badge as a standalone SVG document, 240×80. */
export function badgeSvg({ businessName, badge }: { businessName: string; badge: RatingBadge | null }): string {
  const c = BADGE_COLOURS;
  const { pad, tile, radius } = BADGE_LAYOUT;
  const name = fitName(badgeName(businessName), BADGE_TEXT_ROOM);
  const tileY = (BADGE_HEIGHT - tile) / 2;
  const mark = tile * 0.66;
  const markX = pad + (tile - mark) / 2;
  const markY = tileY + (tile - mark) / 2;
  const x = BADGE_TEXT_X;
  const line = badgeLine(badge);
  const lineColour = badge === "top" ? c.goldInk : c.ink2;
  const star = badge
    ? `<svg x="${x}" y="56" width="12" height="12" viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="${c.gold}"/></svg>`
    : "";
  const lineX = badge ? x + 16 : x;
  const title = escapeMarkup(badgeAlt(badgeName(businessName)));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" ` +
    `viewBox="0 0 ${BADGE_WIDTH} ${BADGE_HEIGHT}" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<rect x="0.5" y="0.5" width="${BADGE_WIDTH - 1}" height="${BADGE_HEIGHT - 1}" rx="${radius}" fill="${c.surface}" stroke="${c.line}"/>` +
    `<rect x="${pad}" y="${tileY}" width="${tile}" height="${tile}" rx="${radius - 2}" fill="${c.brick}"/>` +
    `<svg x="${markX}" y="${markY}" width="${mark}" height="${mark}" viewBox="${BRAND_MARK.viewBox}" fill="none" ` +
    `stroke="${c.onBrick}" stroke-width="${BRAND_MARK.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    BRAND_MARK.paths.map((d) => `<path d="${d}"/>`).join("") +
    `</svg>` +
    `<text x="${x}" y="27" font-family="${SANS}" font-size="10" font-weight="700" letter-spacing="1.1" fill="${c.brick}">` +
    `${BADGE_KICKER.toUpperCase()}</text>` +
    `<text x="${x}" y="48" font-family="${SERIF}" font-size="${name.size}" fill="${c.ink}">${escapeMarkup(name.text)}</text>` +
    star +
    `<text x="${lineX}" y="66" font-family="${SANS}" font-size="12" font-weight="700" fill="${lineColour}">` +
    `${escapeMarkup(line)}</text>` +
    `</svg>`
  );
}
