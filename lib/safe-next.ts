// Where to send someone after sign-in. Only same-site paths under /platform are allowed, so a crafted
// ?next= can never send people off-site (//evil.example, https://…, /\evil) or into /admin.
const ALLOWED = /^\/platform(\/[A-Za-z0-9._~%-]+)*\/?(\?[^#\\]*)?$/;
// "." and ".." segments (also percent-encoded) would let /platform/../admin climb out.
const DOT_SEGMENT = /\/(\.|%2e){1,2}(?=\/|\?|$)/i;

// After sign-in people land on the directory; journeys that need somewhere else (a review, a trader link) say so.
export const DEFAULT_NEXT = "/platform";

export function safeNext(raw: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!raw || !ALLOWED.test(raw) || DOT_SEGMENT.test(raw)) return fallback;
  return raw;
}
