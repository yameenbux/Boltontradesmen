import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const auth = {
  verifyOtp: vi.fn(),
  signInWithOtp: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
};
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
const serviceRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: serviceRpc }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { requestCode, verifyCode } from "@/app/platform/sign-in/actions";
import { completeOnboarding } from "@/app/platform/welcome/actions";
import { SIGN_IN_ERRORS } from "@/lib/otp-gate";
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
};

beforeEach(() => {
  // The phone path's tests run with the switch on; "phone sign-in switched off" below stubs it off.
  vi.stubEnv("SIGN_IN_PHONE", "on");
  process.env.DEVICE_HASH_SECRET = "test-secret";
  process.env.TWILIO_LOOKUP_STUB = "1";
  for (const f of Object.values(auth)) f.mockReset();
  rpc.mockReset();
  serviceRpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.unstubAllEnvs());

describe("phone sign-in switched off", () => {
  beforeEach(() => vi.stubEnv("SIGN_IN_PHONE", "off"));

  it("requestCode refuses with the phone_off copy without calling Supabase or the gate", async () => {
    const res = await requestCode(
      { step: "phone", next: "/platform/account" },
      form({ phone: "07700 900401", next: "/platform/account" }),
    );
    expect(res).toEqual({ step: "phone", next: "/platform/account", error: SIGN_IN_ERRORS.phone_off });
    expect(SIGN_IN_ERRORS.phone_off).toBe(
      "Sign-in by text is switched off. Please continue with Google or use an email code.",
    );
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("verifyCode refuses with the phone_off copy without calling Supabase or the limiter", async () => {
    const res = await verifyCode(
      { step: "code", phone: "+447700900401", next: "/platform/p/ace/review" },
      form({ phone: "+447700900401", code: "123456", next: "//evil.example" }),
    );
    expect(res).toEqual({ step: "phone", next: "/platform/account", error: SIGN_IN_ERRORS.phone_off });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats an unset switch as off", async () => {
    vi.stubEnv("SIGN_IN_PHONE", undefined);
    const res = await requestCode({ step: "phone", next: "/platform/account" }, form({ phone: "07700 900401" }));
    expect(res.error).toBe(SIGN_IN_ERRORS.phone_off);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("verifyCode", () => {
  const base = { step: "code" as const, phone: "+447700900401", next: "/platform/p/ace/review" };

  // The wrong-code limiter (final review 2, I4): otp_verify_gate answers before Supabase is asked.
  function gate(verdict: string, attemptId = 7) {
    serviceRpc.mockImplementation(async (name: string) =>
      name === "otp_verify_gate"
        ? { data: [{ attempt_id: attemptId, verdict }], error: null }
        : { data: null, error: null },
    );
  }
  beforeEach(() => gate("ok"));

  it("asks the wrong-code limiter first and records a wrong code", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "Token has expired or is invalid" } });
    const res = await verifyCode(base, form({ phone: "+447700900401", code: "000000", next: base.next }));
    expect(res.error).toBe(SIGN_IN_ERRORS.bad_code);
    expect(serviceRpc).toHaveBeenCalledWith("otp_verify_gate", { p_phone: "+447700900401", p_ip_hash: ipHash("10.0.0.1") });
    expect(serviceRpc).toHaveBeenCalledWith("otp_verify_record", { p_attempt_id: 7, p_ok: false });
    expect(serviceRpc.mock.invocationCallOrder[0]).toBeLessThan(auth.verifyOtp.mock.invocationCallOrder[0]);
  });

  it("records a right code as ok", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(verifyCode(base, form({ phone: "+447700900401", code: "123456", next: base.next }))).rejects.toThrow(
      "REDIRECT /platform/welcome",
    );
    expect(serviceRpc).toHaveBeenCalledWith("otp_verify_record", { p_attempt_id: 7, p_ok: true });
  });

  it("stops after too many wrong codes for the number, without asking Supabase", async () => {
    gate("number_locked", 0);
    const res = await verifyCode(base, form({ phone: "+447700900401", code: "123456", next: base.next }));
    expect(res).toMatchObject({ step: "code", phone: "+447700900401", error: SIGN_IN_ERRORS.code_number_locked });
    expect(SIGN_IN_ERRORS.code_number_locked).toBe(
      "Too many wrong codes for this number. Please wait 15 minutes, then send yourself a new code.",
    );
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalledWith("otp_verify_record", expect.anything());
  });

  it("stops after too many wrong codes from one connection", async () => {
    gate("ip_locked", 0);
    const res = await verifyCode(base, form({ phone: "+447700900401", code: "123456", next: base.next }));
    expect(res.error).toBe(SIGN_IN_ERRORS.code_ip_locked);
    expect(SIGN_IN_ERRORS.code_ip_locked).toBe("Too many wrong codes from this connection. Please try again in an hour.");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter can't be reached", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await verifyCode(base, form({ phone: "+447700900401", code: "123456", next: base.next }));
    expect(res.error).toBe(SIGN_IN_ERRORS.verify_failed);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("shows the bad-code copy when the code is wrong", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Token has expired or is invalid" },
    });
    const res = await verifyCode(base, form({ phone: "+447700900401", code: "000000", next: base.next }));
    expect(res).toMatchObject({ step: "code", phone: "+447700900401", error: SIGN_IN_ERRORS.bad_code });
  });

  it("does not call Supabase for a code that isn't 6 digits", async () => {
    const res = await verifyCode(base, form({ phone: "+447700900401", code: "12a", next: base.next }));
    expect(res.error).toBe(SIGN_IN_ERRORS.bad_code);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("verifies with type sms and sends a new account to Welcome, keeping next", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(verifyCode(base, form({ phone: "+447700900401", code: "123456", next: base.next }))).rejects.toThrow(
      "REDIRECT /platform/welcome?next=%2Fplatform%2Fp%2Face%2Freview",
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: "+447700900401", token: "123456", type: "sms" });
    expect(rpc).not.toHaveBeenCalledWith("claim_provider_listings");
  });

  it("claims provider listings for an existing member, then goes to next", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockImplementation(async (name: string) => ({ data: name === "my_account" ? ACCOUNT : 0, error: null }));
    await expect(verifyCode(base, form({ phone: "+447700900401", code: "123456", next: base.next }))).rejects.toThrow(
      "REDIRECT /platform/p/ace/review",
    );
    expect(rpc).toHaveBeenCalledWith("claim_provider_listings");
  });

  it("never follows a crafted next off the platform", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    rpc.mockImplementation(async (name: string) => ({ data: name === "my_account" ? ACCOUNT : 0, error: null }));
    await expect(
      verifyCode(base, form({ phone: "+447700900401", code: "123456", next: "//evil.example" })),
    ).rejects.toThrow("REDIRECT /platform/account");
  });
});

describe("requestCode", () => {
  it("moves to the code step after a text is sent", async () => {
    serviceRpc.mockImplementation(async (name: string) =>
      name === "otp_gate" ? { data: [{ request_id: 5, verdict: "ok" }], error: null } : { data: null, error: null },
    );
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const res = await requestCode(
      { step: "phone", next: "/platform/account" },
      form({ phone: "07700 900401", next: "/platform/account" }),
    );
    expect(res).toEqual({ step: "code", phone: "+447700900401", next: "/platform/account" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+447700900401",
      options: { shouldCreateUser: true, data: { bv_nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) } },
    });
    const nonce = auth.signInWithOtp.mock.calls[0][0].options.data.bv_nonce as string;
    expect(serviceRpc).toHaveBeenCalledWith("otp_approve", {
      p_request_id: 5,
      p_line_type: "mobile",
      p_nonce_hash: createHash("sha256").update(nonce).digest("hex"),
    });
    expect(serviceRpc).not.toHaveBeenCalledWith("otp_record", expect.objectContaining({ p_outcome: "approved" }));
    expect(serviceRpc).toHaveBeenCalledWith("otp_gate", {
      p_phone: "+447700900401",
      // the rightmost X-Forwarded-For entry (appended by the trusted proxy), not the spoofable leftmost
      p_ip_hash: ipHash("10.0.0.1"),
    });
    expect(serviceRpc).toHaveBeenCalledWith("otp_record", {
      p_request_id: 5,
      p_outcome: "sent",
      p_line_type: "mobile",
    });
  });

  it("stays on the phone step with the copy and keeps what was typed", async () => {
    const res = await requestCode(
      { step: "phone", next: "/platform/account" },
      form({ phone: "01204 123456", next: "/platform/account" }),
    );
    expect(res).toEqual({
      step: "phone",
      phone: "01204 123456",
      next: "/platform/account",
      error: SIGN_IN_ERRORS.invalid,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("completeOnboarding", () => {
  beforeEach(() => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("flags a wrong group code answered as data (the wrong try stays recorded)", async () => {
    rpc.mockResolvedValue({ data: { error: "bad_group_code" }, error: null });
    const res = await completeOnboarding(
      {},
      form({ first_name: "sarah", surname: "Khan", district: "BL3", group_code: "nope", next: "/platform/account" }),
    );
    expect(res.errors?.group_code).toBe("That group code isn't right. Leave it blank if you don't have one.");
    expect(res.values).toMatchObject({ group_code: "nope" });
  });

  it("says plainly when the day's wrong group-code tries are used up", async () => {
    rpc.mockResolvedValue({ data: { error: "group_code_limit" }, error: null });
    const res = await completeOnboarding(
      {},
      form({ first_name: "sarah", surname: "Khan", district: "BL3", group_code: "Bolton", next: "/platform/account" }),
    );
    expect(res.errors?.group_code).toBe(
      "Too many wrong group codes today. Leave it blank for now and add it from your account page tomorrow.",
    );
    expect(res.values).toMatchObject({ first_name: "sarah", group_code: "Bolton" });
  });

  it("keeps the form filled and flags a wrong group code", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "bad_group_code", code: "P0001" } });
    const res = await completeOnboarding(
      {},
      form({ first_name: "sarah", surname: "Khan", district: "BL3", group_code: "nope", next: "/platform/account" }),
    );
    expect(res.errors?.group_code).toBe("That group code isn't right. Leave it blank if you don't have one.");
    expect(res.values).toMatchObject({ first_name: "sarah", surname: "Khan", district: "BL3", group_code: "nope" });
  });

  it("checks the name before calling the database", async () => {
    const res = await completeOnboarding(
      {},
      form({ first_name: "", surname: "Khan", district: "BL3", group_code: "", next: "" }),
    );
    expect(res.errors?.first_name).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("needs an area", async () => {
    const res = await completeOnboarding(
      {},
      form({ first_name: "Sarah", surname: "Khan", district: "", group_code: "", next: "" }),
    );
    expect(res.errors?.district).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores 'Sarah K.' and goes to next", async () => {
    rpc.mockResolvedValue({ data: ACCOUNT, error: null });
    await expect(
      completeOnboarding(
        {},
        form({
          first_name: "sarah",
          surname: "khan",
          district: "BL3",
          group_code: " bolton ",
          next: "/platform/p/ace/review",
        }),
      ),
    ).rejects.toThrow("REDIRECT /platform/p/ace/review");
    expect(rpc).toHaveBeenCalledWith("complete_onboarding", {
      p_display_name: "Sarah K.",
      p_district: "BL3",
      p_group_code: " bolton ",
    });
  });

  it("sends a signed-out person to sign in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      completeOnboarding(
        {},
        form({ first_name: "Sarah", surname: "Khan", district: "BL3", group_code: "", next: "/platform/account" }),
      ),
    ).rejects.toThrow("REDIRECT /platform/sign-in?next=%2Fplatform%2Faccount");
  });
});
