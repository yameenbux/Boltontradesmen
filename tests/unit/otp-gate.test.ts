import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestSignInCode, SIGN_IN_ERRORS, type GateDeps } from "@/lib/otp-gate";
import type { LineCheck } from "@/lib/line-type";

function deps(over: Partial<GateDeps> = {}) {
  const calls: string[] = [];
  const d = {
    gate: vi.fn(async (phone: string, ipHash: string) => {
      calls.push(`gate ${phone} ${ipHash.length}`);
      return { requestId: 7, verdict: "ok" };
    }),
    record: vi.fn(async (id: number, outcome: string, lineType: string | null) => {
      calls.push(`record ${id} ${outcome} ${lineType}`);
    }),
    lookup: vi.fn(async (): Promise<LineCheck> => ({ kind: "mobile", lineType: "mobile" })),
    send: vi.fn(async (phone: string) => {
      calls.push(`send ${phone}`);
      return { error: null };
    }),
    ...over,
  };
  return { d, calls };
}

beforeEach(() => {
  process.env.DEVICE_HASH_SECRET = "test-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestSignInCode", () => {
  it("refuses an invalid number before the gate", async () => {
    const { d } = deps();
    expect(await requestSignInCode("01204 123456", "1.2.3.4", d)).toEqual({ ok: false, error: SIGN_IN_ERRORS.invalid });
    expect(d.gate).not.toHaveBeenCalled();
  });

  it("stops on a limited number without a Lookup", async () => {
    const { d } = deps({ gate: vi.fn(async () => ({ requestId: 1, verdict: "number_limited" })) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.number_limited,
    });
    expect(d.lookup).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it.each(["ip_limited", "cap_reached"] as const)("stops on %s", async (verdict) => {
    const { d } = deps({ gate: vi.fn(async () => ({ requestId: 1, verdict })) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS[verdict],
    });
    expect(d.lookup).not.toHaveBeenCalled();
  });

  it("records a VoIP line and sends nothing", async () => {
    const { d } = deps({ lookup: vi.fn(async (): Promise<LineCheck> => ({ kind: "voip", lineType: "nonFixedVoip" })) });
    expect(await requestSignInCode("07700 900666", "1.2.3.4", d)).toEqual({ ok: false, error: SIGN_IN_ERRORS.voip });
    expect(d.record).toHaveBeenCalledWith(7, "voip", "nonFixedVoip");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("records other line types as not_mobile", async () => {
    const { d } = deps({ lookup: vi.fn(async (): Promise<LineCheck> => ({ kind: "other", lineType: "landline" })) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.not_mobile,
    });
    expect(d.record).toHaveBeenCalledWith(7, "not_mobile", "landline");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("fails closed when the Lookup errors", async () => {
    const { d } = deps({ lookup: vi.fn(async (): Promise<LineCheck> => ({ kind: "error", reason: "timeout" })) });
    expect(await requestSignInCode("07700 900999", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.lookup_failed,
    });
    expect(d.record).toHaveBeenCalledWith(7, "lookup_failed", null);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("fails closed when the Lookup throws", async () => {
    const { d } = deps({ lookup: vi.fn(async (): Promise<LineCheck> => Promise.reject(new Error("boom"))) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.lookup_failed,
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("approves, sends and records a mobile, in that order", async () => {
    const { d, calls } = deps();
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({ ok: true, phone: "+447700900401" });
    expect(calls).toEqual([
      "gate +447700900401 64",
      "record 7 approved mobile",
      "send +447700900401",
      "record 7 sent mobile",
    ]);
  });

  it("hashes the IP rather than passing it raw", async () => {
    const { d } = deps();
    await requestSignInCode("07700 900401", "1.2.3.4", d);
    expect(vi.mocked(d.gate).mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records send_failed when the text can't be sent", async () => {
    const { d } = deps({ send: vi.fn(async () => ({ error: new Error("twilio") })) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.send_failed,
    });
    expect(d.record).toHaveBeenLastCalledWith(7, "send_failed", "mobile");
  });

  it("treats a throwing send as send_failed", async () => {
    const { d } = deps({ send: vi.fn(async () => Promise.reject(new Error("network"))) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.send_failed,
    });
  });

  it("treats a throwing gate as lookup_failed (no text sent)", async () => {
    const { d } = deps({ gate: vi.fn(async () => Promise.reject(new Error("db down"))) });
    expect(await requestSignInCode("07700 900401", "1.2.3.4", d)).toEqual({
      ok: false,
      error: SIGN_IN_ERRORS.lookup_failed,
    });
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe("SIGN_IN_ERRORS", () => {
  it("has the exact copy", () => {
    expect(SIGN_IN_ERRORS).toEqual({
      invalid: "Enter a UK mobile number, like 07700 900123.",
      number_limited: "Too many codes for this number. Please wait 15 minutes and try again.",
      ip_limited: "Too many sign-in attempts from this connection. Please try again in an hour.",
      cap_reached: "Sign-in texts are paused for now. Please try again later.",
      voip: "This looks like an internet or virtual number. Please use your own UK mobile number.",
      not_mobile: "Please use a UK mobile number that can receive texts.",
      lookup_failed: "We couldn't check your number just now. Please try again in a minute.",
      send_failed: "We couldn't send a text just now. Please try again in a minute.",
      bad_code: "That code didn't work. Check the text and try again, or send a new code.",
    });
  });
});
