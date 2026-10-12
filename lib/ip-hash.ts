import { createHmac } from "node:crypto";

// A keyed hash of the caller's IP for OTP rate limiting (otp_requests.ip_hash). The "ip\n" prefix keeps it
// distinct from deviceHash(ip, "") under the same secret.
export function ipHash(ip: string): string {
  const secret = process.env.DEVICE_HASH_SECRET;
  if (!secret) {
    throw new Error("DEVICE_HASH_SECRET is not set; refusing to compute IP hashes without it");
  }
  return createHmac("sha256", secret).update(`ip\n${ip}`).digest("hex");
}
