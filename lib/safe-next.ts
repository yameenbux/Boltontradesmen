// Where to send someone after sign-in. Only same-site paths are allowed, so a crafted ?next= can never send people
// off-site (//evil.example, https://…, /\evil), and never into /admin, /api or the pre-launch lock page.
// The query may not carry control characters or spaces either: browsers strip tabs and newlines before parsing.
const ALLOWED = /^\/([A-Za-z0-9._~%-]+(\/[A-Za-z0-9._~%-]+)*\/?)?(\?[^#\\\x00-\x20\x7f]*)?$/;
const FORBIDDEN = /^\/(admin|api|site-lock|_next)(\/|\?|$)/i;
// "." and ".." segments (also percent-encoded) would let /x/../admin climb out.
const DOT_SEGMENT = /\/(\.|%2e){1,2}(?=\/|\?|$)/i;

// After sign-in people land on the directory; journeys that need somewhere else (a review, a trader link) say so.
export const DEFAULT_NEXT = "/";

/** A path on this site: the same strict shape as safeNext, with no list of forbidden areas. */
export function isSameSitePath(raw: string | null | undefined): raw is string {
  return !!raw && ALLOWED.test(raw) && !DOT_SEGMENT.test(raw);
}

export function safeNext(raw: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!isSameSitePath(raw) || FORBIDDEN.test(raw)) return fallback;
  return raw;
}
