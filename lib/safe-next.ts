// Where to send someone after sign-in. Only same-site paths are allowed, so a crafted ?next= can never send people
// off-site (//evil.example, https://…, /\evil), and never into /admin, /api or the pre-launch lock page.
const ALLOWED = /^\/([A-Za-z0-9._~%-]+(\/[A-Za-z0-9._~%-]+)*\/?)?(\?[^#\\]*)?$/;
const FORBIDDEN = /^\/(admin|api|site-lock|_next)(\/|\?|$)/i;
// "." and ".." segments (also percent-encoded) would let /x/../admin climb out.
const DOT_SEGMENT = /\/(\.|%2e){1,2}(?=\/|\?|$)/i;

// After sign-in people land on the directory; journeys that need somewhere else (a review, a trader link) say so.
export const DEFAULT_NEXT = "/";

export function safeNext(raw: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!raw || !ALLOWED.test(raw) || FORBIDDEN.test(raw) || DOT_SEGMENT.test(raw)) return fallback;
  return raw;
}
