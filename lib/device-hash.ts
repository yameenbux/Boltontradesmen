import { createHmac } from "node:crypto";

export function deviceHash(ip: string, userAgent: string): string {
  const secret = process.env.DEVICE_HASH_SECRET;
  if (!secret) {
    throw new Error("DEVICE_HASH_SECRET is not set; refusing to compute device hashes without it");
  }
  return createHmac("sha256", secret).update(`${ip}\n${userAgent}`).digest("hex");
}
