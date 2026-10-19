import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const auth = { verifyOtp: vi.fn(), signInWithOtp: vi.fn() };
const rpc = vi.fn();
// The code is sent from the service client (Supabase's CAPTCHA lets the secret key through; this server checks
// Turnstile itself). The cookie client must never send one.
const cookieSignInWithOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerAuthClient: async () => ({ auth: { ...auth, signInWithOtp: cookieSignInWithOtp }, rpc }),
}));
const serviceRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: serviceRpc, auth: { signInWithOtp: auth.signInWithOtp } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { requestEmailCode, verifyEmailCode } from "@/app/(platform)/sign-in/actions";
import { EMAIL_SIGN_IN_ERRORS } from "@/lib/email-gate";
import { ipHash } from "@/lib/ip-hash";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

const ACCOUNT = {
  user_id: "u1",
  display_name: "Sarah K.",
  postcode_district: "BL3",
  group_member: false,
  role: "resident",
  deleted: false,
  created_at: "2026-10-12T09:00:00Z",
  providers: [],
  sign_in_kind: "email",
  email: "sarah@example.com",
};

beforeEach(() => {
  process.env.DEVICE_HASH_SECRET = "test-secret";
  for (const f of Object.values(auth)) f.mockReset();
  cookieSignInWithOtp.mockReset();
  rpc.mockReset();
  serviceRpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestEmailCode", () => {
  it("gates, approves and sends the code with the nonce, then moves to the code step", async () => {
    serviceRpc.mockImplementation(async (name: string) =>
      name === "email_gate" ? { data: [{ request_id: 4, verdict: "ok" }], error: null } : { data: null, error: null },
    );
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const res = await requestEmailCode(
      { step: "email", next: "/account" },
      form({ email: " Sarah@Example.com ", next: "/p/ace/review" }),
    );
    expect(res).toEqual({ step: "code", email: "sarah@example.com", next: "/p/ace/review" });
    expect(serviceRpc).toHaveBeenCalledWith("email_gate", { p_email: "sarah@example.com", p_ip_hash: ipHash("10.0.0.1") });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "sarah@example.com",
      options: { shouldCreateUser: true, data: { bv_nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) } },
    });
    const nonce = auth.signInWithOtp.mock.calls[0][0].options.data.bv_nonce as string;
    expect(serviceRpc).toHaveBeenCalledWith("email_approve", {
      p_request_id: 4,
      p_nonce_hash: createHash("sha256").update(nonce).digest("hex"),
    });
    expect(serviceRpc).toHaveBeenCalledWith("email_record", { p_request_id: 4, p_outcome: "sent" });
    expect(cookieSignInWithOtp).not.toHaveBeenCalled();
  });

  it("stays on the email step with the copy and keeps what was typed", async () => {
    const res = await requestEmailCode(
      { step: "email", next: "/account" },
      form({ email: "x@mailinator.com", next: "/account" }),
    );
    expect(res).toEqual({
      step: "email",
      email: "x@mailinator.com",
      next: "/account",
      error: EMAIL_SIGN_IN_ERRORS.blocked_domain,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("verifyEmailCode", () => {
  const base = { step: "code" as const, email: "sarah@example.com", next: "/p/ace/review" };

  function gate(verdict: string, attemptId = 9) {
    serviceRpc.mockImplementation(async (name: string) =>
      name === "email_verify_gate"
        ? { data: [{ attempt_id: attemptId, verdict }], error: null }
        : { data: null, error: null },
    );
  }
  beforeEach(() => gate("ok"));

  it("stops after too many wrong codes for the address, without asking Supabase", async () => {
    gate("address_locked", 0);
    const res = await verifyEmailCode(base, form({ email: base.email, code: "123456", next: base.next }));
    expect(res).toMatchObject({ step: "code", email: base.email, error: EMAIL_SIGN_IN_ERRORS.code_address_locked });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("stops after too many wrong codes from one connection", async () => {
    gate("ip_locked", 0);
    const res = await verifyEmailCode(base, form({ email: base.email, code: "123456", next: base.next }));
    expect(res.error).toBe(EMAIL_SIGN_IN_ERRORS.code_ip_locked);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter can't be reached", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await verifyEmailCode(base, form({ email: base.email, code: "123456", next: base.next }));
    expect(res.error).toBe(EMAIL_SIGN_IN_ERRORS.verify_failed);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("shows bad_code for a wrong code and records it", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "Token has expired or is invalid" } });
    const res = await verifyEmailCode(base, form({ email: base.email, code: "000000", next: base.next }));
    expect(res).toMatchObject({ step: "code", email: base.email, error: EMAIL_SIGN_IN_ERRORS.bad_code });
    expect(serviceRpc).toHaveBeenCalledWith("email_verify_gate", { p_email: base.email, p_ip_hash: ipHash("10.0.0.1") });
    expect(serviceRpc).toHaveBeenCalledWith("otp_verify_record", { p_attempt_id: 9, p_ok: false });
    expect(serviceRpc.mock.invocationCallOrder[0]).toBeLessThan(auth.verifyOtp.mock.invocationCallOrder[0]);
  });

  it("does not call anything for a code that isn't 6 digits or a bad address", async () => {
    let res = await verifyEmailCode(base, form({ email: base.email, code: "12a", next: base.next }));
    expect(res.error).toBe(EMAIL_SIGN_IN_ERRORS.bad_code);
    res = await verifyEmailCode(base, form({ email: "nope", code: "123456", next: base.next }));
    expect(res.error).toBe(EMAIL_SIGN_IN_ERRORS.bad_code);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies with type email and sends a new account to Welcome, keeping next", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(verifyEmailCode(base, form({ email: base.email, code: "123456", next: base.next }))).rejects.toThrow(
      "REDIRECT /welcome?next=%2Fp%2Face%2Freview",
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "sarah@example.com", token: "123456", type: "email" });
    expect(serviceRpc).toHaveBeenCalledWith("otp_verify_record", { p_attempt_id: 9, p_ok: true });
  });

  it("sends a member to next, never off the platform, and claims no listings", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockImplementation(async (name: string) => ({ data: name === "my_account" ? ACCOUNT : 0, error: null }));
    await expect(
      verifyEmailCode(base, form({ email: base.email, code: "123 456", next: "//evil.example" })),
    ).rejects.toThrow(/REDIRECT \/$/);
    expect(rpc).not.toHaveBeenCalledWith("claim_provider_listings");
  });

  it("sends a deleted account to Welcome", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: { ...ACCOUNT, deleted: true }, error: null });
    await expect(verifyEmailCode(base, form({ email: base.email, code: "123456", next: base.next }))).rejects.toThrow(
      "REDIRECT /welcome",
    );
  });
});

// Plan 2b final review I2: Cloudflare Turnstile, checked before anything touches the database or sends an email.
describe("requestEmailCode with Turnstile", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    serviceRpc.mockImplementation(async (name: string) =>
      name === "email_gate" ? { data: [{ request_id: 4, verdict: "ok" }], error: null } : { data: null, error: null },
    );
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const ask = (extra: Record<string, string> = {}) =>
    requestEmailCode({ step: "email", next: "/account" }, form({ email: "sarah@example.com", next: "/account", ...extra }));

  it("is skipped when the keys are unset (local and CI)", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await ask()).step).toBe("code");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a request without a token, before the gate", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(await ask()).toEqual({
      step: "email",
      email: "sarah@example.com",
      next: "/account",
      error: EMAIL_SIGN_IN_ERRORS.captcha,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("refuses a token Cloudflare rejects, before the gate", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    expect((await ask({ "cf-turnstile-response": "bad" })).error).toBe(EMAIL_SIGN_IN_ERRORS.captcha);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("fails closed when only the site key is set", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await ask({ "cf-turnstile-response": "tok" })).error).toBe(EMAIL_SIGN_IN_ERRORS.gate_failed);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("sends the code once Cloudflare confirms the token, passing the client IP", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect((await ask({ "cf-turnstile-response": "good" })).step).toBe("code");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(body.get("response")).toBe("good");
    expect(body.get("remoteip")).toBe("10.0.0.1");
    expect(auth.signInWithOtp).toHaveBeenCalled();
  });
});
