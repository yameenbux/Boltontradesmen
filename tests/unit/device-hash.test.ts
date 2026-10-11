import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deviceHash } from "@/lib/device-hash";

describe("deviceHash", () => {
  const original = process.env.DEVICE_HASH_SECRET;
  beforeEach(() => {
    process.env.DEVICE_HASH_SECRET = "test-secret";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DEVICE_HASH_SECRET;
    else process.env.DEVICE_HASH_SECRET = original;
  });

  it("is deterministic and 64 hex chars", () => {
    const a = deviceHash("1.2.3.4", "UA");
    expect(a).toBe(deviceHash("1.2.3.4", "UA"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differs when IP differs", () => {
    expect(deviceHash("1.2.3.4", "UA")).not.toBe(deviceHash("1.2.3.5", "UA"));
  });
  it("differs when secret differs", () => {
    const a = deviceHash("1.2.3.4", "UA");
    process.env.DEVICE_HASH_SECRET = "other";
    expect(deviceHash("1.2.3.4", "UA")).not.toBe(a);
  });
  it("throws a clear error when the secret is unset", () => {
    delete process.env.DEVICE_HASH_SECRET;
    expect(() => deviceHash("1.2.3.4", "UA")).toThrow(/DEVICE_HASH_SECRET/);
  });
});
