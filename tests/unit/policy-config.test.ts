import { describe, expect, it } from "vitest";
import { policyIdentity } from "@/lib/policy-config";

describe("policyIdentity", () => {
  it("throws in production when owner or contact is missing", () => {
    expect(() => policyIdentity({}, "production")).toThrow();
    expect(() => policyIdentity({ OWNER_LEGAL_NAME: "A Ltd" }, "production")).toThrow();
    expect(() => policyIdentity({ CONTACT_EMAIL: "a@b.co" }, "production")).toThrow();
  });
  it("returns configured values in production", () => {
    expect(policyIdentity({ OWNER_LEGAL_NAME: "A Ltd", CONTACT_EMAIL: "a@b.co" }, "production")).toEqual({
      owner: "A Ltd",
      contact: "a@b.co",
    });
  });
  it("falls back to placeholders outside production", () => {
    expect(policyIdentity({}, "development").contact).toBe("hello@example.com");
  });
});
