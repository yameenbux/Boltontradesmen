// The visitor's IP, for rate limits, device hashes and consent records.
//
// Railway's edge proxy appends the address it received the connection from to X-Forwarded-For, so the
// RIGHTMOST entry is the one we can trust. Everything to its left was sent by the visitor and can be
// anything (a fresh fake per request would dodge every per-IP limit). With more trusted proxies in front
// of the app (a CDN in front of Railway, say), set TRUSTED_PROXY_HOPS to how many of them append an entry:
// the client is then that many entries from the right. TRUSTED_PROXY_HOPS=0 trusts no forwarding header.

type Env = Record<string, string | undefined>;

export function trustedProxyHops(env: Env = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 1;
  return Number(raw);
}

/** The client IP from request headers, or null when there is none we can trust. */
export function clientIpFrom(headers: Headers, hops: number = trustedProxyHops()): string | null {
  if (hops <= 0) return null;
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length > 0) return entries[Math.max(0, entries.length - hops)];
  return headers.get("x-real-ip")?.trim() || null;
}
