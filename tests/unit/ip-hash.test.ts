import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ipHash, rateLimitKey } from "@/lib/ip-hash";
import { deviceHash } from "@/lib/device-hash";

describe("ipHash", () => {
  const original = process.env.DEVICE_HASH_SECRET;
  beforeEach(() => {
    process.env.DEVICE_HASH_SECRET = "test-secret";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DEVICE_HASH_SECRET;
    else process.env.DEVICE_HASH_SECRET = original;
  });

  it("is 64 hex chars, deterministic, and differs from the device hash", () => {
    const h = ipHash("1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash("1.2.3.4")).toBe(h);
    expect(h).not.toBe(deviceHash("1.2.3.4", ""));
    expect(ipHash("1.2.3.5")).not.toBe(h);
  });

  it("groups IPv6 addresses by their /64, since one connection usually holds the whole /64", () => {
    expect(ipHash("2001:db8:1:2::1")).toBe(ipHash("2001:db8:1:2:ffff:ffff:ffff:fffe"));
    expect(ipHash("2001:0DB8:0001:0002:0000:0000:0000:0001")).toBe(ipHash("2001:db8:1:2::1"));
    expect(ipHash("2001:db8:1:3::1")).not.toBe(ipHash("2001:db8:1:2::1"));
    expect(ipHash("::ffff:1.2.3.4")).toBe(ipHash("1.2.3.4"));
  });

  it("throws when the secret is unset", () => {
    delete process.env.DEVICE_HASH_SECRET;
    expect(() => ipHash("1.2.3.4")).toThrow(/DEVICE_HASH_SECRET/);
  });
});

describe("rateLimitKey", () => {
  it("keeps IPv4 addresses whole", () => {
    expect(rateLimitKey("1.2.3.4")).toBe("1.2.3.4");
    expect(rateLimitKey(" 1.2.3.4 ")).toBe("1.2.3.4");
  });

  it("cuts IPv6 addresses to their /64 in one canonical form", () => {
    expect(rateLimitKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:0DB8:0001:0002:abcd:0:0:1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("[2001:db8:1:2::1]")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitKey("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(rateLimitKey("64:ff9b::192.0.2.33")).toBe("64:ff9b:0:0::/64");
  });

  it("maps IPv4-mapped IPv6 to the IPv4 address", () => {
    expect(rateLimitKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(rateLimitKey("::FFFF:1.2.3.4")).toBe("1.2.3.4");
  });

  it("leaves anything it can't parse as it is (lower case)", () => {
    expect(rateLimitKey("unknown")).toBe("unknown");
    expect(rateLimitKey("1::2::3")).toBe("1::2::3");
    expect(rateLimitKey("G::1")).toBe("g::1");
  });
});
