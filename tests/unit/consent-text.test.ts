import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CONSENT_TEXT_VERSION, consentStatement, PRIVACY_LINK_TEXT } from "@/lib/consent-text";

const env = { OWNER_LEGAL_NAME: "Jane Doe Ltd", CONTACT_EMAIL: "jane@example.org" };

describe("consentStatement", () => {
  it("is the 2026-10-12 wording", () => {
    expect(CONSENT_TEXT_VERSION).toBe("2026-10-12");
  });

  it("covers every required point in plain English", () => {
    const text = consentStatement(env, "development")!.paragraphs.join("\n");
    for (const phrase of [
      "without your approval",
      "simply because you disagree",
      "you can reply to any review",
      "from your own page",
      "within one working day",
      "come back if you list again",
      "comes from reviews only",
      "Your basic listing is free.",
      "you'll never be removed for not buying them",
      "they never change your place in the list",
      "I have read the privacy notice",
      "operated by",
      "data controller",
    ]) {
      expect(text).toContain(phrase);
    }
    expect(text).not.toContain("you'll be able to reply to reviews");
    expect(text).not.toMatch(/tradespeople/i);
    expect(text).not.toMatch(/review policy/i);
  });

  it("has one paragraph per card: listing, reviews, leaving, fairness, privacy, controller", () => {
    const s = consentStatement(env, "development")!;
    expect(s.cards.map((c) => c.key)).toEqual(["listing", "reviews", "leaving", "fairness", "privacy", "controller"]);
    expect(s.paragraphs).toHaveLength(6);
  });

  it("names the operator and contact in the controller line", () => {
    const s = consentStatement(env, "development")!;
    expect(s.paragraphs.at(-1)).toBe(
      "Bolton Vouched is operated by Jane Doe Ltd, the data controller for this information. Contact: jane@example.org.",
    );
  });

  it("builds each paragraph from exactly the card's title and body, as rendered", () => {
    const s = consentStatement(env, "development")!;
    expect(s.cards.map((c) => (c.title ? `${c.title}. ${c.body}` : c.body))).toEqual(s.paragraphs);
    expect(s.cards.find((c) => c.key === "privacy")!.title).toContain(PRIVACY_LINK_TEXT);
  });

  it("hashes exactly the paragraphs shown", () => {
    const s = consentStatement(env, "development")!;
    expect(s.sha256).toBe(createHash("sha256").update(s.paragraphs.join("\n\n")).digest("hex"));
    expect(s.owner).toBe("Jane Doe Ltd");
    expect(s.contact).toBe("jane@example.org");
  });

  it("changes the hash when the operator changes", () => {
    const a = consentStatement(env, "development")!;
    const b = consentStatement({ ...env, OWNER_LEGAL_NAME: "Someone Else Ltd" }, "development")!;
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("falls back to placeholders outside production", () => {
    expect(consentStatement({}, "development")!.owner).toContain("pending");
  });

  it("fails closed in production when env is missing", () => {
    expect(consentStatement({}, "production")).toBeNull();
    expect(consentStatement({ OWNER_LEGAL_NAME: "x" }, "production")).toBeNull();
    expect(consentStatement({ CONTACT_EMAIL: "x@example.org" }, "production")).toBeNull();
    expect(consentStatement({ OWNER_LEGAL_NAME: "  ", CONTACT_EMAIL: "x@example.org" }, "production")).toBeNull();
    expect(consentStatement(env, "production")).not.toBeNull();
  });
});

describe("consent text and sign-in (Plan 2b)", () => {
  it("says nothing about how traders sign in, so the version stays 2026-10-12", () => {
    const text = consentStatement(env, "development")!.paragraphs.join("\n");
    for (const word of ["mobile", "sign in", "Google", "email code"]) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
    expect(CONSENT_TEXT_VERSION).toBe("2026-10-12");
  });
});
