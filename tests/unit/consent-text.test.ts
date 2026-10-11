import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consentStatement } from "@/lib/consent-text";

const env = { OWNER_LEGAL_NAME: "Jane Doe Ltd", CONTACT_EMAIL: "jane@example.org" };

describe("consentStatement", () => {
  it("includes the acknowledgement and controller line, and no review-policy promise", () => {
    const s = consentStatement(env, "development")!;
    const text = s.paragraphs.join("\n");
    expect(text).toContain("I have read the privacy notice.");
    expect(text).toContain("Bolton Vouched is run by Jane Doe Ltd. We're the data controller for the information above. Contact: jane@example.org.");
    expect(text).not.toMatch(/review policy/i);
  });
  it("hashes exactly the paragraphs shown", () => {
    const s = consentStatement(env, "development")!;
    expect(s.sha256).toBe(createHash("sha256").update(s.paragraphs.join("\n\n")).digest("hex"));
    expect(s.owner).toBe("Jane Doe Ltd");
    expect(s.contact).toBe("jane@example.org");
  });
  it("falls back to placeholders outside production", () => {
    expect(consentStatement({}, "development")!.owner).toContain("pending");
  });
  it("fails closed in production when env is missing", () => {
    expect(consentStatement({}, "production")).toBeNull();
    expect(consentStatement({ OWNER_LEGAL_NAME: "x" }, "production")).toBeNull();
    expect(consentStatement(env, "production")).not.toBeNull();
  });
});
