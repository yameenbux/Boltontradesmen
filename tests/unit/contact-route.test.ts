import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { phone_e164: string; whatsapp_e164: string | null };
const state: {
  rpc: () => Promise<{ data: Row[] | null; error: unknown }>;
  select: () => Promise<{ data: Row | null; error: unknown }>;
  rpcArgs: unknown[];
  actor: (cookie: string | null) => Promise<string | null>;
  allowed: boolean;
} = {
  rpc: async () => ({ data: [], error: null }),
  select: async () => ({ data: null, error: null }),
  rpcArgs: [],
  actor: async () => null,
  allowed: true,
};

vi.mock("@/lib/rate-limit", () => ({ rateAllow: async () => state.allowed }));
vi.mock("@/lib/tap-actor", () => ({ tapActor: (cookie: string | null) => state.actor(cookie) }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: (name: string, args: unknown) => {
      state.rpcArgs.push([name, args]);
      return state.rpc();
    },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: () => state.select() }) }),
      }),
    }),
  }),
}));

import { GET, HEAD } from "@/app/api/contact/[slug]/route";
import { deviceHash } from "@/lib/device-hash";

const call = (slug: string, via?: string, ua = "UA", cookie?: string) =>
  GET(
    new Request(`http://localhost/api/contact/${slug}${via ? `?via=${via}` : ""}`, {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1", "user-agent": ua, ...(cookie ? { cookie } : {}) },
    }),
    { params: Promise.resolve({ slug }) },
  );

beforeEach(() => {
  process.env.DEVICE_HASH_SECRET = "test-secret";
  state.rpcArgs = [];
  state.rpc = async () => ({ data: [{ phone_e164: "+447700900123", whatsapp_e164: "+447700900123" }], error: null });
  state.select = async () => ({ data: null, error: null });
  state.actor = async () => null;
  state.allowed = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/contact/[slug]", () => {
  it("via=call redirects 302 to tel: with no-store", async () => {
    const res = await call("acme", "call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("tel:+447700900123");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [name, args] = state.rpcArgs[0] as [string, Record<string, unknown>];
    expect(name).toBe("log_contact");
    expect(args).toMatchObject({ p_slug: "acme", p_type: "call_tap", p_actor: null });
    expect(args.p_device_hash).toMatch(/^[0-9a-f]{64}$/);
    // the rightmost X-Forwarded-For entry (appended by the trusted proxy), not the spoofable leftmost
    // One enquirer per connection: the user agent isn't part of it, so changing it doesn't count again.
    expect(args.p_device_hash).toBe(deviceHash("10.0.0.1", ""));
  });

  it("logs a signed-in tapper's id (so the trader's own and the admin's taps aren't counted)", async () => {
    const seen: (string | null)[] = [];
    state.actor = async (cookie) => {
      seen.push(cookie);
      return cookie ? "00000000-0000-0000-0000-0000000000aa" : null;
    };
    const res = await call("acme", "call", "UA", "sb-127-auth-token=abc");
    expect(res.status).toBe(302);
    expect(seen).toEqual(["sb-127-auth-token=abc"]);
    expect((state.rpcArgs[0] as [string, Record<string, unknown>])[1]).toMatchObject({
      p_actor: "00000000-0000-0000-0000-0000000000aa",
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("via=whatsapp redirects to wa.me without plus", async () => {
    const res = await call("acme", "whatsapp");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://wa.me/447700900123");
  });

  it("via=whatsapp with null whatsapp_e164 is 404", async () => {
    state.rpc = async () => ({ data: [{ phone_e164: "+447700900123", whatsapp_e164: null }], error: null });
    const res = await call("acme", "whatsapp");
    expect(res.status).toBe(404);
  });

  it("unknown slug is 404", async () => {
    state.rpc = async () => ({ data: [], error: null });
    expect((await call("nope", "call")).status).toBe(404);
  });

  it("invalid or missing via is 400", async () => {
    expect((await call("acme", "sms")).status).toBe(400);
    expect((await call("acme")).status).toBe(400);
  });

  it("falls back to a direct phone lookup when log_contact throws", async () => {
    state.rpc = async () => {
      throw new Error("db down");
    };
    state.select = async () => ({ data: { phone_e164: "+447700900123", whatsapp_e164: null }, error: null });
    const res = await call("acme", "call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("tel:+447700900123");
    expect(console.error).toHaveBeenCalled();
  });

  it("falls back when log_contact returns an error object", async () => {
    state.rpc = async () => ({ data: null, error: { message: "boom" } });
    state.select = async () => ({ data: { phone_e164: "+447700900123", whatsapp_e164: null }, error: null });
    expect((await call("acme", "call")).status).toBe(302);
  });

  it("404s when logging fails and the fallback finds nothing", async () => {
    state.rpc = async () => {
      throw new Error("db down");
    };
    expect((await call("acme", "call")).status).toBe(404);
  });

  it("gives link-preview bots the trader's page, not the number, and logs nothing", async () => {
    const res = await call("acme", "call", "WhatsApp/2.23.20.0");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/p/acme");
    expect(state.rpcArgs).toHaveLength(0);
  });

  it("refuses a connection past its hourly limit, without revealing or logging anything", async () => {
    state.allowed = false;
    const res = await call("acme", "call");
    expect(res.status).toBe(429);
    expect(res.headers.get("location")).toBeNull();
    expect(state.rpcArgs).toHaveLength(0);
  });
});

describe("HEAD /api/contact/[slug]", () => {
  it("returns 204 no-store and logs nothing", async () => {
    const res = await HEAD();
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(state.rpcArgs).toHaveLength(0);
  });
});
