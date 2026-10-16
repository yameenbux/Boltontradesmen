import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { turnstileSiteKey, verifyTurnstile, TURNSTILE_VERIFY_URL } from "@/lib/turnstile";

// Plan 2b final review I2: Cloudflare Turnstile on "Email me a code". Off when neither key is set (local, CI);
// otherwise every request needs a token Cloudflare confirms, and a half-configured server fails closed.

function reply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("TURNSTILE_SITE_KEY", "");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("turnstileSiteKey", () => {
  it("is null when unset or blank", () => {
    expect(turnstileSiteKey()).toBeNull();
    vi.stubEnv("TURNSTILE_SITE_KEY", "   ");
    expect(turnstileSiteKey()).toBeNull();
  });

  it("is the trimmed site key when set", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", " 0x4AAAAAAA ");
    expect(turnstileSiteKey()).toBe("0x4AAAAAAA");
  });
});

describe("verifyTurnstile", () => {
  it("skips the check when neither key is set, without calling Cloudflare", async () => {
    const fetchImpl = reply({ success: false });
    expect(await verifyTurnstile("", "1.2.3.4", fetchImpl)).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the site key is set but the secret is missing", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile("token", "1.2.3.4", fetchImpl)).toEqual({ ok: false, reason: "misconfigured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the secret is set but the site key is missing (no widget can show)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(await verifyTurnstile("token", "1.2.3.4", reply({ success: true }))).toEqual({
      ok: false,
      reason: "misconfigured",
    });
  });

  describe("when configured", () => {
    beforeEach(() => {
      vi.stubEnv("TURNSTILE_SITE_KEY", "site");
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    });

    it("refuses a missing token without calling Cloudflare", async () => {
      const fetchImpl = reply({ success: true });
      expect(await verifyTurnstile("  ", "1.2.3.4", fetchImpl)).toEqual({ ok: false, reason: "missing" });
      expect(await verifyTurnstile(null, "1.2.3.4", fetchImpl)).toEqual({ ok: false, reason: "missing" });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("posts the secret, token and client IP to siteverify and accepts success", async () => {
      const fetchImpl = reply({ success: true });
      expect(await verifyTurnstile("tok", "1.2.3.4", fetchImpl)).toEqual({ ok: true });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(TURNSTILE_VERIFY_URL);
      expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init.method).toBe("POST");
      const body = new URLSearchParams(String(init.body));
      expect(Object.fromEntries(body)).toEqual({ secret: "secret", response: "tok", remoteip: "1.2.3.4" });
    });

    it("leaves out an unknown client IP", async () => {
      const fetchImpl = reply({ success: true });
      await verifyTurnstile("tok", "unknown", fetchImpl);
      const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
      expect(body.has("remoteip")).toBe(false);
    });

    it("refuses a token Cloudflare rejects", async () => {
      expect(await verifyTurnstile("tok", "1.2.3.4", reply({ success: false, "error-codes": ["invalid-input-response"] }))).toEqual(
        { ok: false, reason: "rejected" },
      );
    });

    it("fails closed when Cloudflare can't be reached or answers badly", async () => {
      const down = vi.fn(async () => {
        throw new Error("network down");
      });
      expect(await verifyTurnstile("tok", "1.2.3.4", down)).toEqual({ ok: false, reason: "unreachable" });
      expect(await verifyTurnstile("tok", "1.2.3.4", reply({ oops: true }, 500))).toEqual({
        ok: false,
        reason: "unreachable",
      });
    });
  });
});
