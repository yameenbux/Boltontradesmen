import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { EMAIL_SIGN_IN_ERRORS, requestEmailSignInCode, type EmailGateDeps } from "@/lib/email-gate";
import { ipHash } from "@/lib/ip-hash";

function deps(overrides: Partial<{ [K in keyof EmailGateDeps]: Mock<EmailGateDeps[K]> }> = {}) {
  return {
    gate: vi.fn<EmailGateDeps["gate"]>(async () => ({ requestId: 11, verdict: "ok" })),
    approve: vi.fn<EmailGateDeps["approve"]>(async () => {}),
    record: vi.fn<EmailGateDeps["record"]>(async () => {}),
    send: vi.fn<EmailGateDeps["send"]>(async () => ({ error: null })),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.DEVICE_HASH_SECRET = "test-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("EMAIL_SIGN_IN_ERRORS", () => {
  it("has the exact copy", () => {
    expect(EMAIL_SIGN_IN_ERRORS).toEqual({
      invalid: "Enter your email address, like name@example.com.",
      blocked_domain: "Please use your own email address. Temporary or throwaway addresses can't sign in.",
      address_limited: "Too many codes for this address. Please wait 15 minutes and try again.",
      ip_limited: "Too many sign-in attempts from this connection. Please try again in an hour.",
      cap_reached: "Sign-in emails are paused for today. Please try again tomorrow, or continue with Google.",
      address_taken:
        "There's already an account for this address. Use the exact address you signed up with, or continue with Google.",
      admin_address: "This address can't sign in here.",
      too_soon: "Please wait a minute before asking for another code.",
      busy: "A lot of people are signing in right now. Please try again in an hour, or use Continue with Google.",
      captcha: "Please complete the security check, then try again.",
      send_failed: "We couldn't send the email just now. Please try again in a minute.",
      gate_failed: "We couldn't start sign-in just now. Please try again in a minute.",
      bad_code: "That code didn't work. Check the email and try again, or send a new code.",
      code_address_locked: "Too many wrong codes for this address. Please wait 15 minutes, then send yourself a new code.",
      code_ip_locked: "Too many wrong codes from this connection. Please try again in an hour.",
      verify_failed: "We couldn't check your code just now. Please try again in a minute.",
    });
  });
});

describe("requestEmailSignInCode", () => {
  it("refuses an invalid address without asking the gate", async () => {
    const d = deps();
    for (const input of ["", "no-at-sign", "a@b", "a b@c.com"]) {
      expect(await requestEmailSignInCode(input, "1.2.3.4", d)).toEqual({
        ok: false,
        error: EMAIL_SIGN_IN_ERRORS.invalid,
      });
    }
    expect(d.gate).not.toHaveBeenCalled();
  });

  it("refuses a throwaway domain (and its subdomains) without asking the gate", async () => {
    const d = deps();
    for (const input of ["x@mailinator.com", "x@a.mailinator.com"]) {
      expect(await requestEmailSignInCode(input, "1.2.3.4", d)).toEqual({
        ok: false,
        error: EMAIL_SIGN_IN_ERRORS.blocked_domain,
      });
    }
    expect(d.gate).not.toHaveBeenCalled();
  });

  for (const verdict of [
    "invalid",
    "admin_address",
    "blocked_domain",
    "address_taken",
    "address_limited",
    "ip_limited",
    "cap_reached",
  ] as const) {
    it(`shows the ${verdict} copy and sends nothing`, async () => {
      const d = deps({ gate: vi.fn<EmailGateDeps["gate"]>(async () => ({ requestId: 3, verdict })) });
      expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", d)).toEqual({
        ok: false,
        error: EMAIL_SIGN_IN_ERRORS[verdict],
      });
      expect(d.approve).not.toHaveBeenCalled();
      expect(d.send).not.toHaveBeenCalled();
    });
  }

  it("fails closed on an unknown verdict or a gate that throws", async () => {
    const odd = deps({ gate: vi.fn<EmailGateDeps["gate"]>(async () => ({ requestId: 3, verdict: "what" })) });
    expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", odd)).toEqual({
      ok: false,
      error: EMAIL_SIGN_IN_ERRORS.gate_failed,
    });
    const broken = deps({
      gate: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", broken)).toEqual({
      ok: false,
      error: EMAIL_SIGN_IN_ERRORS.gate_failed,
    });
    expect(broken.send).not.toHaveBeenCalled();
  });

  it("fails closed when approval fails", async () => {
    const d = deps({
      approve: vi.fn(async () => {
        throw new Error("request not pending");
      }),
    });
    expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", d)).toEqual({
      ok: false,
      error: EMAIL_SIGN_IN_ERRORS.gate_failed,
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("gates, approves with a nonce hash, sends the address as typed, then records 'sent'", async () => {
    const d = deps();
    const res = await requestEmailSignInCode("  Sarah.Khan+bv@GoogleMail.com ", "10.0.0.1", d);
    expect(res).toEqual({ ok: true, email: "sarah.khan+bv@googlemail.com" });
    expect(d.gate).toHaveBeenCalledWith("sarah.khan+bv@googlemail.com", ipHash("10.0.0.1"));
    expect(d.approve).toHaveBeenCalledWith(11, expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(d.send).toHaveBeenCalledWith("sarah.khan+bv@googlemail.com", expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
    expect(d.record).toHaveBeenCalledWith(11, "sent");
    const { createHash } = await import("node:crypto");
    const nonce = d.send.mock.calls[0][1] as string;
    expect(d.approve.mock.calls[0][1]).toBe(createHash("sha256").update(nonce).digest("hex"));
    expect(d.gate.mock.invocationCallOrder[0]).toBeLessThan(d.approve.mock.invocationCallOrder[0]);
    expect(d.approve.mock.invocationCallOrder[0]).toBeLessThan(d.send.mock.invocationCallOrder[0]);
    expect(d.send.mock.invocationCallOrder[0]).toBeLessThan(d.record.mock.invocationCallOrder[0]);
  });

  // Review Focus 2: "Send a new code" within a minute — GoTrue answers 429.
  it("says to wait a minute when Supabase answers 429, recording send_failed", async () => {
    const d = deps({ send: vi.fn(async () => ({ error: { status: 429, message: "For security purposes, you can only request this after 59 seconds." } })) });
    expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", d)).toEqual({
      ok: false,
      error: EMAIL_SIGN_IN_ERRORS.too_soon,
    });
    expect(d.record).toHaveBeenCalledWith(11, "send_failed");
  });

  // Final review M1: Supabase's site-wide email limit also answers 429, without "after N seconds".
  it("says lots of people are signing in when Supabase's site-wide limit answers 429", async () => {
    for (const message of ["Email rate limit exceeded", "Request rate limit reached"]) {
      const d = deps({ send: vi.fn(async () => ({ error: { status: 429, message } })) });
      expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", d)).toEqual({
        ok: false,
        error: EMAIL_SIGN_IN_ERRORS.busy,
      });
      expect(d.record).toHaveBeenCalledWith(11, "send_failed");
    }
    const once = deps({
      send: vi.fn(async () => ({
        error: { status: 429, message: "For security purposes, you can only request this after 42 seconds." },
      })),
    });
    expect((await requestEmailSignInCode("sarah@example.com", "1.2.3.4", once)) as { error: string }).toEqual({
      ok: false,
      error: EMAIL_SIGN_IN_ERRORS.too_soon,
    });
  });

  it("shows send_failed for any other send error, or a send that throws", async () => {
    const d = deps({ send: vi.fn(async () => ({ error: { status: 500, message: "smtp down" } })) });
    expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", d)).toEqual({
      ok: false,
      error: EMAIL_SIGN_IN_ERRORS.send_failed,
    });
    expect(d.record).toHaveBeenCalledWith(11, "send_failed");
    const t = deps({
      send: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect((await requestEmailSignInCode("sarah@example.com", "1.2.3.4", t)).ok).toBe(false);
    expect(t.record).toHaveBeenCalledWith(11, "send_failed");
  });

  it("still reports success when only recording 'sent' fails", async () => {
    const d = deps({
      record: vi.fn(async () => {
        throw new Error("db");
      }),
    });
    expect(await requestEmailSignInCode("sarah@example.com", "1.2.3.4", d)).toEqual({
      ok: true,
      email: "sarah@example.com",
    });
  });
});
