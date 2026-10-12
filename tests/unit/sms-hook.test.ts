import { createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSendSmsHook, sendSms, verifyHookSignature, type SmsHookDeps } from "@/lib/sms-hook";

const KEY = randomBytes(32);
const SECRET = `v1,whsec_${KEY.toString("base64")}`;
const NOW = 1_760_000_000; // seconds

// Signs exactly as GoTrue does (standardwebhooks: base64 HMAC-SHA256 of "id.timestamp.body").
function sign(body: string, opts: { id?: string; ts?: number; key?: Buffer } = {}) {
  const id = opts.id ?? "msg_1";
  const ts = String(opts.ts ?? NOW);
  const sig = createHmac("sha256", opts.key ?? KEY).update(`${id}.${ts}.${body}`).digest("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` });
}

function payload(over: Record<string, unknown> = {}) {
  return JSON.stringify({ user: { id: "u1", phone: "447700900410", new_phone: "", ...over }, sms: { otp: "482913" } });
}

function deps(over: Partial<SmsHookDeps> = {}): SmsHookDeps {
  return {
    secret: SECRET,
    now: () => NOW * 1000,
    gate: vi.fn(async () => "ok"),
    send: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("verifyHookSignature", () => {
  const body = payload();
  it("accepts GoTrue's signature", () => {
    expect(verifyHookSignature(SECRET, sign(body), body, NOW * 1000)).toBe(true);
  });
  it("accepts when one of several signatures matches (secret rotation)", () => {
    const h = sign(body);
    h.set("webhook-signature", `v1,${Buffer.from("nope").toString("base64")}, ${h.get("webhook-signature")}`);
    expect(verifyHookSignature(SECRET, h, body, NOW * 1000)).toBe(true);
  });
  it("refuses a tampered body", () => {
    expect(verifyHookSignature(SECRET, sign(body), body.replace("482913", "000000"), NOW * 1000)).toBe(false);
  });
  it("refuses another secret", () => {
    expect(verifyHookSignature(SECRET, sign(body, { key: randomBytes(32) }), body, NOW * 1000)).toBe(false);
  });
  it("refuses a stale or future timestamp (replay)", () => {
    expect(verifyHookSignature(SECRET, sign(body, { ts: NOW - 301 }), body, NOW * 1000)).toBe(false);
    expect(verifyHookSignature(SECRET, sign(body, { ts: NOW + 301 }), body, NOW * 1000)).toBe(false);
  });
  it("refuses missing headers and a malformed secret", () => {
    expect(verifyHookSignature(SECRET, new Headers(), body, NOW * 1000)).toBe(false);
    expect(verifyHookSignature("whsec_only", sign(body), body, NOW * 1000)).toBe(false);
    expect(verifyHookSignature("", sign(body), body, NOW * 1000)).toBe(false);
  });
});

describe("handleSendSmsHook", () => {
  it("texts the code for a request the app approved", async () => {
    const d = deps();
    const body = payload();
    expect(await handleSendSmsHook(sign(body), body, d)).toEqual({ status: 200, body: {} });
    expect(d.gate).toHaveBeenCalledWith("+447700900410");
    expect(d.send).toHaveBeenCalledWith("+447700900410", expect.stringContaining("482913"));
  });

  it("refuses a text the app did not ask for (direct /otp to an existing account) and sends nothing", async () => {
    const d = deps({ gate: vi.fn(async () => "refused") });
    const body = payload();
    const res = await handleSendSmsHook(sign(body), body, d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { http_code: 403, message: expect.any(String) } });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses phone-change texts without asking the gate", async () => {
    const d = deps();
    const body = payload({ new_phone: "447700900411" });
    expect((await handleSendSmsHook(sign(body), body, d)).status).toBe(403);
    expect(d.gate).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses an unsigned or wrongly signed call", async () => {
    const d = deps();
    const body = payload();
    expect((await handleSendSmsHook(new Headers(), body, d)).status).toBe(401);
    expect((await handleSendSmsHook(sign(body, { key: randomBytes(32) }), body, d)).status).toBe(401);
    expect(d.gate).not.toHaveBeenCalled();
  });

  it("fails closed when the hook secret is not configured", async () => {
    const d = deps({ secret: undefined });
    const body = payload();
    expect((await handleSendSmsHook(sign(body), body, d)).status).toBe(500);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses a payload without a phone or a code", async () => {
    const d = deps();
    for (const body of [JSON.stringify({ user: { phone: "" }, sms: { otp: "1" } }), JSON.stringify({ user: { phone: "447700900410" } }), "not json"]) {
      expect((await handleSendSmsHook(sign(body), body, d)).status).toBe(400);
    }
    expect(d.send).not.toHaveBeenCalled();
  });

  it("fails closed when the gate errors", async () => {
    const d = deps({ gate: vi.fn(async () => Promise.reject(new Error("db down"))) });
    const body = payload();
    expect((await handleSendSmsHook(sign(body), body, d)).status).toBe(500);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("reports a failed send", async () => {
    const d = deps({ send: vi.fn(async () => ({ ok: false as const, reason: "Twilio HTTP 400" })) });
    const body = payload();
    expect((await handleSendSmsHook(sign(body), body, d)).status).toBe(502);
  });
});

describe("sendSms", () => {
  const env = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_MESSAGING_SERVICE_SID: "MG456" };

  it("posts to Twilio Programmable Messaging through the Messaging Service", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    expect(await sendSms("+447700900410", "Your code is 1", env, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    const form = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(form)).toEqual({ To: "+447700900410", MessagingServiceSid: "MG456", Body: "Your code is 1" });
  });

  it("fails without credentials or on a Twilio error", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 400 }));
    expect((await sendSms("+447700900410", "x", {}, fetchImpl as unknown as typeof fetch)).ok).toBe(false);
    expect((await sendSms("+447700900410", "x", env, fetchImpl as unknown as typeof fetch)).ok).toBe(false);
  });

  it("stubs Ofcom drama numbers locally without calling Twilio", async () => {
    const fetchImpl = vi.fn();
    expect(await sendSms("+447700900410", "x", { TWILIO_SMS_STUB: "1" }, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    // real numbers are never stubbed
    expect((await sendSms("+447911123456", "x", { TWILIO_SMS_STUB: "1" }, fetchImpl as unknown as typeof fetch)).ok).toBe(false);
  });
});
