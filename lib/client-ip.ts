// The visitor's IP, for rate limits, device hashes and consent records.
//
// Railway's edge proxy appends the address it received the connection from to X-Forwarded-For, so the
// RIGHTMOST entry is the one we can trust. Everything to its left was sent by the visitor and can be
// anything (a fresh fake per request would dodge every per-IP limit). With more trusted proxies in front
// of the app (a CDN in front of Railway, say), set TRUSTED_PROXY_HOPS to how many of them append an entry:
// the client is then that many entries from the right. TRUSTED_PROXY_HOPS=0 trusts no forwarding header.
//
// Some hosts instead set one header of their own that overwrites whatever the visitor sent (True-Client-IP
// or CF-Connecting-IP behind Cloudflare). CLIENT_IP_HEADER names it, and then that header alone is read and
// X-Forwarded-For is ignored. Only name a header after checking a visitor can't forge it on that host.

type Env = Record<string, string | undefined>;

export function trustedProxyHops(env: Env = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 1;
  return Number(raw);
}

export function clientIpHeader(env: Env = process.env): string | null {
  const raw = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  return raw && /^[a-z0-9-]+$/.test(raw) ? raw : null;
}

/** The client IP from request headers, or null when there is none we can trust. */
export function clientIpFrom(
  headers: Headers,
  hops: number = trustedProxyHops(),
  ipHeader: string | null = clientIpHeader(),
): string | null {
  if (ipHeader) return headers.get(ipHeader)?.split(",")[0].trim() || null;
  if (hops <= 0) return null;
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length > 0) return entries[Math.max(0, entries.length - hops)];
  return headers.get("x-real-ip")?.trim() || null;
}
