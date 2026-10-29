import { describe, expect, it } from "vitest";
import { spotlightFacts, spotlightText, type SpotlightInput } from "@/lib/spotlight";

const BOLTON = ["BL1", "BL2", "BL3", "BL4", "BL5", "BL6", "BL7"];
const base: SpotlightInput = {
  slug: "a-a-heating-engineer",
  businessName: "A A HEATING ENGINEER",
  areas: [...BOLTON, "M26"],
  hasWhatsapp: true,
  checks: [],
  idChecked: false,
  reviewCount: 0,
  availability: "taking",
  trades: ["Appliance repair", "Heating repair"],
};

describe("spotlightFacts", () => {
  it("leads with the trade in the name, and lists only what the listing says", () => {
    expect(spotlightFacts(base)).toEqual({
      name: "A A HEATING ENGINEER",
      tradeLine: "Heating repair · Appliance repair",
      lines: ["Covers all of Bolton, M26", "Taking on work now", "Call or WhatsApp them direct"],
    });
  });

  it("never claims an accreditation, insurance or ID check the listing doesn't have", () => {
    const lines = spotlightFacts(base).lines.join(" ");
    expect(lines).not.toMatch(/gas safe|insur|accredit|ID checked|None provided/i);
  });

  it("shows recorded checks (at most two), reviews, and plain contact without WhatsApp", () => {
    const f = spotlightFacts({
      ...base,
      checks: [
        { kind: "gas_safe", expires_on: "2027-03-01" },
        { kind: "insurance", expires_on: "2027-01-01" },
        { kind: "niceic_napit", expires_on: "2027-01-01" },
      ],
      reviewCount: 1,
      availability: "booked",
      hasWhatsapp: false,
    });
    expect(f.lines).toEqual([
      "Public liability insurance",
      "Gas Safe registered",
      "Covers all of Bolton, M26",
      "1 review from local customers",
      "Call them direct",
    ]);
  });

  it("strips anything that reads as a phone number from the name", () => {
    expect(spotlightFacts({ ...base, businessName: "Ace Plumbing 07700 900123" }).name).not.toMatch(/07700/);
  });
});

describe("spotlightText", () => {
  it("is the post: who, the facts, their page, the review link, the free listing", () => {
    const t = spotlightText(base, "https://www.boltonvouched.co.uk");
    expect(t.split("\n")[0]).toBe("🛠️ Trader spotlight: A A HEATING ENGINEER");
    expect(t).toContain("Heating repair and appliance repair in Bolton, listed on Bolton Vouched.");
    expect(t).toContain("✅ Taking on work now");
    expect(t).toContain("👉 boltonvouched.co.uk/p/a-a-heating-engineer");
    expect(t).toContain("boltonvouched.co.uk/r/a-a-heating-engineer");
    expect(t).toContain("Get listed free: boltonvouched.co.uk/for-traders");
    // Neutral review wording (DMCC Act): never asks for a good review.
    expect(t).toMatch(/honest review/);
    expect(t).not.toMatch(/5.star|good review|great review/i);
  });
});
