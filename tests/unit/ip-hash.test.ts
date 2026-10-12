import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ipHash } from "@/lib/ip-hash";
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

  it("throws when the secret is unset", () => {
    delete process.env.DEVICE_HASH_SECRET;
    expect(() => ipHash("1.2.3.4")).toThrow(/DEVICE_HASH_SECRET/);
  });
});
