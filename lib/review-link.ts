// Review request links (the trader's "ask for a review" tools): a short link per provider, /r/<slug>, which
// next.config.ts redirects (308, no page render) to the review form with ?ref=card, so reviews that start there are
// recorded with source 'card' for the admin. Pure functions, so they can be unit tested.
//
// Wording rule (CMA guidance, DMCC Act): ask every customer for an honest review. Never ask only happy customers, never
// ask for a good or 5-star review. Keep every message here neutral.
import { platformPath } from "@/lib/paths";
import { siteUrl } from "@/lib/seo";

/** The only review source the site records (reviews.source). */
export const CARD_REF = "card";
export type ReviewSource = typeof CARD_REF;

/** The short path printed on the card and shared by the trader. */
export function reviewShortPath(slug: string): string {
  return `/r/${encodeURIComponent(slug)}`;
}

/** The full short link, e.g. https://boltonvouched.ysbdesigns.uk/r/ace-plumbing. */
export function reviewLink(slug: string, base: string = siteUrl()): string {
  return `${base}${reviewShortPath(slug)}`;
}

/** The short link as people type it: no https://, no www. */
export function displayLink(link: string): string {
  return link.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

/** The review form, carrying ?ref=card when the person came from the card (the short link's destination). */
export function reviewFormPath(slug: string, source: ReviewSource | null = null): string {
  const path = platformPath("p", slug, "review");
  return source ? `${path}?ref=${source}` : path;
}

/** ?ref=… as given (a string, a repeated param, or nothing) → the recorded source, or null for anything unknown. */
export function reviewSource(ref: string | string[] | null | undefined): ReviewSource | null {
  const v = Array.isArray(ref) ? ref[0] : ref;
  return v === CARD_REF ? CARD_REF : null;
}

/** The message the trader sends a customer. Neutral: asks for an honest review, whatever the job was like. */
export function reviewRequestMessage(businessName: string, link: string): string {
  return `Thanks for choosing ${businessName.trim()}. If you've a minute, please leave an honest review on Bolton Vouched: ${link}`;
}

/** WhatsApp's share link (the person picks who to send it to). */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Everything the Copy link / Share on WhatsApp buttons need for one listing. */
export function reviewShare(slug: string, businessName: string, base: string = siteUrl()) {
  const link = reviewLink(slug, base);
  return { link, display: displayLink(link), whatsapp: whatsappShareUrl(reviewRequestMessage(businessName, link)) };
}
