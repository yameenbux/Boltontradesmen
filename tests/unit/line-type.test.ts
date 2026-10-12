import { describe, it, expect, vi } from "vitest";
import { checkLineType } from "@/lib/line-type";

const CREDS = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok" };

function jsonFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("checkLineType", () => {
  it("maps a mobile line", async () => {
    const f = jsonFetch({ line_type_intelligence: { type: "mobile" } });
    expect(await checkLineType("+447911123456", CREDS, f)).toEqual({ kind: "mobile", lineType: "mobile" });
  });

  it.each(["nonFixedVoip", "fixedVoip"])("maps %s to voip", async (type) => {
    const f = jsonFetch({ line_type_intelligence: { type } });
    expect(await checkLineType("+447911123456", CREDS, f)).toEqual({ kind: "voip", lineType: type });
  });

  it("maps a landline to other", async () => {
    const f = jsonFetch({ line_type_intelligence: { type: "landline" } });
    expect(await checkLineType("+447911123456", CREDS, f)).toEqual({ kind: "other", lineType: "landline" });
  });

  it("calls Lookup v2 with Basic auth at the exact URL", async () => {
    const f = jsonFetch({ line_type_intelligence: { type: "mobile" } });
    await checkLineType("+447911123456", CREDS, f);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://lookups.twilio.com/v2/PhoneNumbers/%2B447911123456?Fields=line_type_intelligence");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails closed on an HTTP error", async () => {
    const f = jsonFetch({ message: "boom" }, 500);
    expect((await checkLineType("+447911123456", CREDS, f)).kind).toBe("error");
  });

  it("fails closed on a timeout", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    expect((await checkLineType("+447911123456", CREDS, f)).kind).toBe("error");
  });

  it("fails closed when Lookup reports an error code or no type", async () => {
    expect((await checkLineType("+447911123456", CREDS, jsonFetch({ line_type_intelligence: { type: null, error_code: 60600 } }))).kind).toBe(
      "error",
    );
    expect((await checkLineType("+447911123456", CREDS, jsonFetch({ line_type_intelligence: null }))).kind).toBe("error");
  });

  it("fails closed without credentials and never calls fetch", async () => {
    const f = jsonFetch({ line_type_intelligence: { type: "mobile" } });
    expect((await checkLineType("+447911123456", { TWILIO_AUTH_TOKEN: "tok" }, f)).kind).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("checkLineType stub (TWILIO_LOOKUP_STUB=1)", () => {
  const env = { TWILIO_LOOKUP_STUB: "1" };

  it("answers drama-range numbers without calling fetch", async () => {
    const f = jsonFetch({});
    expect(await checkLineType("+447700900401", env, f)).toEqual({ kind: "mobile", lineType: "mobile" });
    expect(await checkLineType("+447700900666", env, f)).toEqual({ kind: "voip", lineType: "nonFixedVoip" });
    expect((await checkLineType("+447700900999", env, f)).kind).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });

  it("still uses the real Lookup outside the drama range", async () => {
    const f = jsonFetch({ line_type_intelligence: { type: "mobile" } });
    await checkLineType("+447911123456", { ...env, ...CREDS }, f);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
