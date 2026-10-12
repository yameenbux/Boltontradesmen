import { describe, expect, it } from "vitest";
import { clientIpFrom, trustedProxyHops } from "@/lib/client-ip";

function h(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("clientIpFrom", () => {
  it("takes the rightmost X-Forwarded-For entry with one trusted hop (Railway's edge appends the real IP)", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.7" }), 1)).toBe("203.0.113.7");
    expect(clientIpFrom(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }), 1)).toBe("203.0.113.7");
  });

  it("ignores entries a visitor spoofs on the left of the header", () => {
    const spoofed = h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7,  203.0.113.7 " });
    expect(clientIpFrom(spoofed, 1)).toBe("203.0.113.7");
    // a fresh spoof per request no longer produces a fresh "client"
    expect(clientIpFrom(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }), 1)).toBe("203.0.113.7");
  });

  it("counts the configured number of trusted hops from the right", () => {
    const xff = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.2" });
    expect(clientIpFrom(xff, 2)).toBe("203.0.113.7");
    expect(clientIpFrom(xff, 3)).toBe("6.6.6.6");
  });

  it("uses the leftmost entry when there are fewer entries than trusted hops", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.7" }), 2)).toBe("203.0.113.7");
  });

  it("skips empty entries", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, , 203.0.113.7," }), 1)).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then null", () => {
    expect(clientIpFrom(h({ "x-real-ip": " 203.0.113.9 " }), 1)).toBe("203.0.113.9");
    expect(clientIpFrom(h({}), 1)).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": " , " }), 1)).toBeNull();
  });

  it("trusts no forwarding header with zero trusted hops", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" }), 0)).toBeNull();
  });

  it("reads TRUSTED_PROXY_HOPS by default", () => {
    const xff = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.2" });
    const before = process.env.TRUSTED_PROXY_HOPS;
    try {
      process.env.TRUSTED_PROXY_HOPS = "2";
      expect(clientIpFrom(xff)).toBe("203.0.113.7");
      delete process.env.TRUSTED_PROXY_HOPS;
      expect(clientIpFrom(xff)).toBe("10.0.0.2");
    } finally {
      if (before === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = before;
    }
  });
});

describe("trustedProxyHops", () => {
  it("defaults to 1 and rejects nonsense", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-1" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "two" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "" })).toBe(1);
  });
});
