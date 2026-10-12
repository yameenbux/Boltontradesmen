import { createHash, randomBytes } from "node:crypto";
import { ipHash } from "@/lib/ip-hash";
import type { LineCheck } from "@/lib/line-type";
import { toUkMobileE164 } from "@/lib/phone";

// Exact copy shown on the sign-in page. Never a raw error.
export const SIGN_IN_ERRORS = {
  invalid: "Enter a UK mobile number, like 07700 900123.",
  number_limited: "Too many codes for this number. Please wait 15 minutes and try again.",
  ip_limited: "Too many sign-in attempts from this connection. Please try again in an hour.",
  cap_reached: "Sign-in texts are paused for now. Please try again later.",
  voip: "This looks like an internet or virtual number. Please use your own UK mobile number.",
  not_mobile: "Please use a UK mobile number that can receive texts.",
  lookup_failed: "We couldn't check your number just now. Please try again in a minute.",
  send_failed: "We couldn't send a text just now. Please try again in a minute.",
  bad_code: "That code didn't work. Check the text and try again, or send a new code.",
} as const;

export type GateDeps = {
  gate(phone: string, ipHash: string): Promise<{ requestId: number; verdict: string }>;
  record(id: number, outcome: string, lineType: string | null): Promise<void>;
  /** Marks the request approved and binds it to the nonce (only its sha256 is stored). */
  approve(id: number, lineType: string, nonceHash: string): Promise<void>;
  lookup(phone: string): Promise<LineCheck>;
  /** Sends the code; the nonce must reach GoTrue in the sign-up metadata (`bv_nonce`). */
  send(phone: string, nonce: string): Promise<{ error: unknown | null }>;
};

export type SignInCodeResult = { ok: true; phone: string } | { ok: false; error: string };

const GATE_VERDICTS = new Set(["number_limited", "ip_limited", "cap_reached"]);

/**
 * Everything that happens before a sign-in text goes out, in order: validate the number → database gate
 * (rate limits and the monthly SMS cap, recorded in otp_requests) → line-type Lookup → approve the request,
 * bound to a fresh single-use nonce → send, passing the nonce to GoTrue → record "sent" or "send_failed".
 * The auth.users guard only lets a new phone account in with the nonce of an approved, unused request, so a
 * sign-up that did not come through here (GoTrue's /signup with a password, say) is refused.
 * Fails closed: if anything before the send goes wrong, no text is sent.
 */
export async function requestSignInCode(input: string, ip: string, deps: GateDeps): Promise<SignInCodeResult> {
  let phone: string;
  try {
    phone = toUkMobileE164(input);
  } catch {
    return { ok: false, error: SIGN_IN_ERRORS.invalid };
  }

  let requestId: number;
  let lineType: string;
  const nonce = randomBytes(32).toString("base64url");
  try {
    const gate = await deps.gate(phone, ipHash(ip || "unknown"));
    requestId = gate.requestId;
    if (gate.verdict !== "ok") {
      if (GATE_VERDICTS.has(gate.verdict)) {
        return { ok: false, error: SIGN_IN_ERRORS[gate.verdict as "number_limited" | "ip_limited" | "cap_reached"] };
      }
      console.error("sign-in: unexpected gate verdict", gate.verdict);
      return { ok: false, error: SIGN_IN_ERRORS.lookup_failed };
    }

    const line = await deps.lookup(phone);
    if (line.kind === "error") {
      console.error("sign-in: line-type lookup failed:", line.reason);
      await deps.record(requestId, "lookup_failed", null);
      return { ok: false, error: SIGN_IN_ERRORS.lookup_failed };
    }
    if (line.kind === "voip") {
      await deps.record(requestId, "voip", line.lineType);
      return { ok: false, error: SIGN_IN_ERRORS.voip };
    }
    if (line.kind !== "mobile") {
      await deps.record(requestId, "not_mobile", line.lineType);
      return { ok: false, error: SIGN_IN_ERRORS.not_mobile };
    }
    lineType = line.lineType;
    await deps.approve(requestId, lineType, createHash("sha256").update(nonce).digest("hex"));
  } catch (err) {
    console.error("sign-in: number check failed:", err);
    return { ok: false, error: SIGN_IN_ERRORS.lookup_failed };
  }

  let sendError: unknown = null;
  try {
    sendError = (await deps.send(phone, nonce)).error;
  } catch (err) {
    sendError = err;
  }
  try {
    await deps.record(requestId, sendError ? "send_failed" : "sent", lineType);
  } catch (err) {
    console.error("sign-in: could not record the send outcome:", err);
  }
  if (sendError) {
    console.error("sign-in: text not sent:", sendError);
    return { ok: false, error: SIGN_IN_ERRORS.send_failed };
  }
  return { ok: true, phone };
}
