import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));

import { POST } from "@/app/api/auth/sms-hook/route";

const KEY = randomBytes(32);
const SECRET = `v1,whsec_${KEY.toString("base64")}`;

function signedRequest(body: string, key: Buffer = KEY) {
  const id = "msg_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return new Request("http://localhost/api/auth/sms-hook", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` },
    body,
  });
}

const BODY = JSON.stringify({ user: { id: "u1", phone: "447700900410", new_phone: "" }, sms: { otp: "482913" } });

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "ok", error: null });
  vi.stubEnv("SUPABASE_SMS_HOOK_SECRET", SECRET);
  vi.stubEnv("TWILIO_SMS_STUB", "1");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/auth/sms-hook", () => {
  it("refuses with 403 when phone sign-in is off (unset), before the signature and any RPC", async () => {
    vi.stubEnv("SIGN_IN_PHONE", undefined);
    const res = await POST(signedRequest(BODY));
    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { http_code: 403, message: "Phone sign-in is switched off" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses with 403 when off, even for a badly signed body", async () => {
    vi.stubEnv("SIGN_IN_PHONE", "off");
    const res = await POST(signedRequest(BODY, randomBytes(32)));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the existing behaviour when on: the signature check still runs", async () => {
    vi.stubEnv("SIGN_IN_PHONE", "on");
    const bad = await POST(signedRequest(BODY, randomBytes(32)));
    expect(bad.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the existing behaviour when on: a signed body reaches the gate", async () => {
    vi.stubEnv("SIGN_IN_PHONE", "on");
    const res = await POST(signedRequest(BODY));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("sms_hook_gate", { p_phone: "+447700900410" });
  });
});
