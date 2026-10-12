import { createHmac } from "node:crypto";

/**
 * The part of an IP address that rate limits count against. IPv4 addresses are kept whole. An IPv6 connection
 * is usually handed a whole /64 (2^64 addresses), so a limit per full IPv6 address can be dodged by using a new
 * address each time: IPv6 addresses are cut to their /64, in one canonical form (`2001:db8:1:2::/64`).
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`) counts as the IPv4 address. Anything unparseable is used as it is.
 */
export function rateLimitKey(ip: string): string {
  const raw = ip.trim().replace(/^\[(.*)\]$/, "$1").split("%")[0].toLowerCase();
  if (!raw.includes(":")) return raw;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(raw);
  if (mapped) return mapped[1];

  const halves = raw.split("::");
  if (halves.length > 2) return raw;
  const groups = (part: string): string[] | null => {
    if (part === "") return [];
    const out: string[] = [];
    const bits = part.split(":");
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      // A dotted IPv4 tail (e.g. 64:ff9b::192.0.2.33) is two groups.
      if (i === bits.length - 1 && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(b)) {
        const o = b.split(".").map(Number);
        if (o.some((n) => n > 255)) return null;
        out.push(((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
      } else if (/^[0-9a-f]{1,4}$/.test(b)) {
        out.push(b);
      } else {
        return null;
      }
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return raw;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return raw;
  const all = [...head, ...Array(missing).fill("0"), ...tail];
  return `${all
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

// A keyed hash of the caller's IP (IPv6 cut to its /64) for rate limiting (otp_requests.ip_hash and the
// wrong-code limiter). The "ip\n" prefix keeps it distinct from deviceHash(ip, "") under the same secret.
export function ipHash(ip: string): string {
  const secret = process.env.DEVICE_HASH_SECRET;
  if (!secret) {
    throw new Error("DEVICE_HASH_SECRET is not set; refusing to compute IP hashes without it");
  }
  return createHmac("sha256", secret).update(`ip\n${rateLimitKey(ip)}`).digest("hex");
}
