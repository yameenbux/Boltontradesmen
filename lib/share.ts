// Sharing a profile and the "Vouched in Bolton" website badge: the profile link, the share message, the badge image
// URLs and the embed snippet traders paste into their own sites. Pure functions, so they can be unit tested.
// Copy stays neutral: it names the business and the site, never a rating claim beyond the badge it has earned.
import { platformPath } from "@/lib/paths";
import { displayLink, whatsappShareUrl } from "@/lib/review-link";
import { absoluteUrl, SITE_NAME, siteUrl } from "@/lib/seo";

/** The profile's full link, e.g. https://boltonvouched.ysbdesigns.uk/p/ace-plumbing. */
export function profileUrl(slug: string, base: string = siteUrl()): string {
  return absoluteUrl(platformPath("p", slug), base);
}

/** The message that goes with a shared profile: "Ace Plumbing on Bolton Vouched: <link>". */
export function profileShareText(businessName: string, url: string): string {
  return `${businessName.trim()} on ${SITE_NAME}: ${url}`;
}

/** Everything the Share button needs for one profile: the Web Share title and link, and the WhatsApp fallback. */
export function profileShare(slug: string, businessName: string, base: string = siteUrl()) {
  const url = profileUrl(slug, base);
  const title = `${businessName.trim()} on ${SITE_NAME}`;
  return { url, title, whatsapp: whatsappShareUrl(profileShareText(businessName, url)) };
}

/** The trader's "Share your page" buttons (components/review-card/ShareReviewLink.tsx): link, as printed, WhatsApp. */
export function pageShare(slug: string, businessName: string, base: string = siteUrl()) {
  const link = profileUrl(slug, base);
  return { link, display: displayLink(link), whatsapp: whatsappShareUrl(profileShareText(businessName, link)) };
}

/** Badge sizes: the SVG is drawn at this size; the PNG at 3x, sharp enough for print and van stickers. */
export const BADGE_WIDTH = 240;
export const BADGE_HEIGHT = 80;
export const BADGE_PNG_SCALE = 3;

export type BadgeFormat = "svg" | "png";

/** /badge/<slug>.svg or .png. */
export function badgePath(slug: string, format: BadgeFormat = "svg"): string {
  return `/badge/${encodeURIComponent(slug)}.${format}`;
}

/** "ace-plumbing.svg" → { slug, format }, or null for anything else (the route answers 404). */
export function parseBadgeFile(file: string): { slug: string; format: BadgeFormat } | null {
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(svg|png)$/.exec(file);
  return m ? { slug: m[1], format: m[2] as BadgeFormat } : null;
}

/** Text for an HTML attribute or element, or an XML text node: & < > " ' escaped. */
export function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The badge's alt text: "<Business> — vouched in Bolton on Bolton Vouched". */
export function badgeAlt(businessName: string): string {
  return `${businessName.trim()} — vouched in Bolton on ${SITE_NAME}`;
}

/**
 * The snippet a trader pastes into their website: the badge image linking to their profile (?utm_source=badge, so
 * visits from it can be told apart; the profile's canonical URL has no query, so it is not a second page to search
 * engines). Every attribute is escaped, so a name such as Smith & Sons "The Best" can't break the HTML.
 */
export function badgeEmbedCode(slug: string, businessName: string, base: string = siteUrl()): string {
  const href = `${profileUrl(slug, base)}?utm_source=badge`;
  const src = absoluteUrl(badgePath(slug, "svg"), base);
  return (
    `<a href="${escapeMarkup(href)}"><img src="${escapeMarkup(src)}" alt="${escapeMarkup(badgeAlt(businessName))}" ` +
    `width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}"></a>`
  );
}

/**
 * The link a trader pastes into the Website box of their Google Business Profile: their page here, tagged
 * ?utm_source=google_business so visits from Google can be told apart (the page's canonical URL has no query).
 */
export function googleProfileLink(slug: string, base: string = siteUrl()): string {
  return `${profileUrl(slug, base)}?utm_source=google_business`;
}

/** Everything the "Your website badge" section needs for one listing. */
export function badgeShare(slug: string, businessName: string, base: string = siteUrl()) {
  return {
    svg: badgePath(slug, "svg"),
    png: badgePath(slug, "png"),
    alt: badgeAlt(businessName),
    embed: badgeEmbedCode(slug, businessName, base),
    downloadName: `bolton-vouched-${slug}`,
  };
}
