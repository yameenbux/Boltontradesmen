import { describe, expect, it } from "vitest";
import { emailDomain, isDisposableDomain, normaliseEmail } from "@/lib/email";

// Review Focus 1: one normalised key however the address is typed. The same table is in
// supabase/tests/email_rules.test.sql (private.normalise_email); keep the two identical.
const NORMALISE_CASES: [string, string | null][] = [
  ["  Sarah.Khan+bv@GoogleMail.com ", "sarahkhan@gmail.com"],
  ["sarahkhan@gmail.com", "sarahkhan@gmail.com"],
  ["Jo.Bloggs+x@Outlook.com", "jo.bloggs@outlook.com"],
  ["", null],
  ["no-at-sign", null],
  ["a@b", null],
  ["a b@c.com", null],
  [`${"a".repeat(243)}@example.com`, null], // 255 characters
];

const NEVER_BLOCK = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.co.uk",
  "hotmail.com",
  "live.co.uk",
  "yahoo.co.uk",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "talktalk.net",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "ysbdesigns.uk",
];

describe("normaliseEmail", () => {
  it.each(NORMALISE_CASES)("%j → %j", (input, expected) => {
    expect(normaliseEmail(input)).toBe(expected);
  });

  it("the 255-character case really is 255 characters, and 254 is allowed", () => {
    expect(NORMALISE_CASES[7][0]).toHaveLength(255);
    expect(normaliseEmail(`${"a".repeat(242)}@example.com`)).toBe(`${"a".repeat(242)}@example.com`);
  });
});

describe("emailDomain", () => {
  it("is the lowercased part after the last @", () => {
    expect(emailDomain(" Jo@Mail.Example.COM ")).toBe("mail.example.com");
    expect(emailDomain("no-at-sign")).toBeNull();
  });
});

describe("isDisposableDomain", () => {
  it("blocks listed domains and their subdomains", () => {
    expect(isDisposableDomain("mailinator.com")).toBe(true);
    expect(isDisposableDomain("x.mailinator.com")).toBe(true);
    expect(isDisposableDomain("a.b.mailinator.com")).toBe(true);
  });

  it.each(NEVER_BLOCK)("never blocks %s", (domain) => {
    expect(isDisposableDomain(domain)).toBe(false);
  });

  it("uses a supplied list", () => {
    expect(isDisposableDomain("x.example.org", new Set(["example.org"]))).toBe(true);
    expect(isDisposableDomain("mailinator.com", new Set(["example.org"]))).toBe(false);
  });
});
