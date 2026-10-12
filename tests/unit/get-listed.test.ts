import { describe, it, expect, vi, beforeEach } from "vitest";

const serviceRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: serviceRpc }) }));
// The action must never use the cookie client: the form is on a public page.
vi.mock("@/lib/supabase/server", () => ({
  createServerAuthClient: async () => {
    throw new Error("the Get listed action must not touch auth cookies");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }),
  cookies: async () => {
    throw new Error("the Get listed action must not touch cookies");
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { requestListing } from "@/app/(info)/get-listed/actions";
import { filledTooFast, formStartToken } from "@/lib/form-timing";
import { ipHash } from "@/lib/ip-hash";
import { LISTING_ERRORS, MIN_FILL_MS, THANKS_PATH } from "@/lib/listing-request";
import { parseListingRequest } from "@/lib/listing-request-parse";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

const GOOD = {
  business_name: "  Ace Plumbing ",
  contact_name: "Sam",
  trade: "Plumber",
  area: "BL3",
  phone: "07700 900123",
  email: "",
  message: "",
  permission: "yes",
};

beforeEach(() => {
  process.env.DEVICE_HASH_SECRET = "test-secret";
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  serviceRpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const started = () => formStartToken(Date.now() - 10_000);

describe("parseListingRequest", () => {
  it("trims, turns the number into E.164 and blanks into null", () => {
    const r = parseListingRequest(form({ ...GOOD, email: " Sam@Example.ORG " }));
    expect(r).toEqual({
      ok: true,
      data: {
        business_name: "Ace Plumbing",
        contact_name: "Sam",
        trade: "Plumber",
        area: "BL3",
        phone_e164: "+447700900123",
        email: "sam@example.org",
        message: null,
      },
    });
  });

  it("accepts a landline", () => {
    const r = parseListingRequest(form({ ...GOOD, phone: "(01204) 123456" }));
    expect(r.ok && r.data.phone_e164).toBe("+441204123456");
  });

  it("gives one message per wrong field", () => {
    const r = parseListingRequest(
      form({
        business_name: " ",
        contact_name: "x".repeat(61),
        trade: "",
        area: "y".repeat(61),
        phone: "12345",
        email: "nope",
        message: "z".repeat(501),
      }),
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        business_name: LISTING_ERRORS.business_name,
        contact_name: LISTING_ERRORS.contact_name,
        trade: LISTING_ERRORS.trade,
        area: LISTING_ERRORS.area,
        phone: LISTING_ERRORS.phone,
        email: LISTING_ERRORS.email,
        message: LISTING_ERRORS.message,
        permission: LISTING_ERRORS.permission,
      },
    });
  });

  it("refuses foreign numbers", () => {
    const r = parseListingRequest(form({ ...GOOD, phone: "+1 202 555 0100" }));
    expect(r.ok).toBe(false);
  });
});

describe("form timing", () => {
  it("passes a signed time over 3 seconds old", () => {
    expect(filledTooFast(formStartToken(1_000_000), 1_000_000 + MIN_FILL_MS)).toBe(false);
  });

  it("catches a quick submit, a missing or forged time, and one from the future", () => {
    expect(filledTooFast(formStartToken(1_000_000), 1_000_000 + MIN_FILL_MS - 1)).toBe(true);
    expect(filledTooFast("", 2_000_000)).toBe(true);
    expect(filledTooFast(`1000000.${"0".repeat(64)}`, 2_000_000)).toBe(true);
    const [, sig] = formStartToken(1_000_000).split(".");
    expect(filledTooFast(`900000.${sig}`, 2_000_000)).toBe(true);
    expect(filledTooFast(formStartToken(3_000_000), 2_000_000)).toBe(true);
  });
});

describe("requestListing", () => {
  it("stores a good request with the connection hash, then shows the thank-you page", async () => {
    serviceRpc.mockResolvedValue({ data: "ok", error: null });
    await expect(requestListing({}, form({ ...GOOD, started: started() }))).rejects.toThrow(`REDIRECT ${THANKS_PATH}`);
    expect(serviceRpc).toHaveBeenCalledWith("submit_listing_request", {
      p_business_name: "Ace Plumbing",
      p_contact_name: "Sam",
      p_trade: "Plumber",
      p_area: "BL3",
      p_phone_e164: "+447700900123",
      p_email: null,
      p_message: null,
      p_ip_hash: ipHash("10.0.0.1"),
    });
  });

  it("pretends to work, storing nothing, when the honeypot is filled", async () => {
    await expect(
      requestListing({}, form({ ...GOOD, started: started(), website: "http://spam.example" })),
    ).rejects.toThrow(`REDIRECT ${THANKS_PATH}`);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("pretends to work, storing nothing, when the form came back too fast", async () => {
    await expect(requestListing({}, form({ ...GOOD, started: formStartToken() }))).rejects.toThrow(
      `REDIRECT ${THANKS_PATH}`,
    );
    await expect(requestListing({}, form({ ...GOOD }))).rejects.toThrow(`REDIRECT ${THANKS_PATH}`);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("returns field errors and what was typed", async () => {
    const res = await requestListing({}, form({ ...GOOD, phone: "123", permission: "", started: started() }));
    expect(res.errors).toEqual({ phone: LISTING_ERRORS.phone, permission: LISTING_ERRORS.permission });
    expect(res.values?.phone).toBe("123");
    expect(res.values?.business_name).toBe("  Ace Plumbing ");
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("says so when the database's limits are reached", async () => {
    serviceRpc.mockResolvedValue({ data: "limited", error: null });
    const res = await requestListing({}, form({ ...GOOD, started: started() }));
    expect(res.message).toBe(LISTING_ERRORS.limited);
    expect(res.values?.permission).toBe("yes");
  });

  it("fails politely when the database errors or refuses", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await requestListing({}, form({ ...GOOD, started: started() }))).message).toBe(LISTING_ERRORS.failed);
    serviceRpc.mockResolvedValue({ data: "invalid", error: null });
    expect((await requestListing({}, form({ ...GOOD, started: started() }))).message).toBe(LISTING_ERRORS.failed);
  });

  it("checks Turnstile when it's configured, before saving anything", async () => {
    process.env.TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const res = await requestListing({}, form({ ...GOOD, started: started() }));
    expect(res.message).toBe(LISTING_ERRORS.captcha);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("fails closed when only one Turnstile key is set", async () => {
    process.env.TURNSTILE_SITE_KEY = "site";
    const res = await requestListing({}, form({ ...GOOD, started: started() }));
    expect(res.message).toBe(LISTING_ERRORS.failed);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});
