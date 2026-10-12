import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MIN_FILL_MS } from "@/lib/listing-request";

// When a public form was shown, signed so a script can't simply send an old time. A form sent back sooner than
// MIN_FILL_MS after it was shown (or with no valid time at all) was filled by a script: the action pretends it
// worked and stores nothing. Signed with DEVICE_HASH_SECRET; the "form-start\n" prefix keeps it apart from the
// device and IP hashes made with the same secret.

function sign(ms: string): string {
  const secret = process.env.DEVICE_HASH_SECRET;
  if (!secret) throw new Error("DEVICE_HASH_SECRET is not set; refusing to sign form times without it");
  return createHmac("sha256", secret).update(`form-start\n${ms}`).digest("hex");
}

/** "<ms>.<signature>" for the hidden field, made when the page is rendered. */
export function formStartToken(now: number = Date.now()): string {
  const ms = String(Math.floor(now));
  return `${ms}.${sign(ms)}`;
}

/** True when the token is missing, forged, from the future or younger than MIN_FILL_MS. Never throws on bad input. */
export function filledTooFast(token: string | null | undefined, now: number = Date.now()): boolean {
  const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec((token ?? "").trim());
  if (!m) return true;
  const expected = Buffer.from(sign(m[1]), "hex");
  const given = Buffer.from(m[2], "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return true;
  const age = now - Number(m[1]);
  return age < MIN_FILL_MS;
}
