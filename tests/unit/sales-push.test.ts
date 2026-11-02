import { describe, expect, it } from "vitest";
import type { PublicProvider } from "@/lib/directory";
import { FOUNDING_PLACES, FOUNDING_UNTIL, foundingPlacesLeft, placesLeftText } from "@/lib/founding";
import { mergeHeatingLists } from "@/lib/heating";
import { websiteCheckEmail } from "@/lib/website-check";
import { parseWebsiteCheck } from "@/lib/website-check-parse";

describe("founding offer", () => {
  it("counts down from the real number taken, never below zero", () => {
    expect(FOUNDING_PLACES).toBe(20);
    expect(foundingPlacesLeft(0)).toBe(20);
    expect(foundingPlacesLeft(1)).toBe(19);
    expect(foundingPlacesLeft(25)).toBe(0);
    expect(placesLeftText(19)).toBe("19 of 20 places left");
    expect(placesLeftText(1)).toBe("1 of 20 places left");
  });

  it("hides the offer when the count can't be read", () => {
    expect(foundingPlacesLeft(null)).toBeNull();
    expect(foundingPlacesLeft(-1)).toBeNull();
    expect(foundingPlacesLeft(Number.NaN)).toBeNull();
  });

  it("ends on the date the page states", () => {
    expect(FOUNDING_UNTIL).toEqual({ iso: "2027-01-31", label: "31 January 2027" });
  });
});

const p = (id: string, o: Partial<PublicProvider> = {}): PublicProvider =>
  ({ id, slug: id, score: null, reviewCount: 0, lastReviewAt: null, createdAt: "2026-10-01T00:00:00Z", ...o }) as PublicProvider;

describe("mergeHeatingLists", () => {
  it("lists each trader once, ranked by reviews then newcomers newest first", () => {
    const top = p("top", { score: 90, reviewCount: 5 });
    const mid = p("mid", { score: 70, reviewCount: 4 });
    const newer = p("newer", { createdAt: "2026-10-20T00:00:00Z" });
    const older = p("older", { createdAt: "2026-10-02T00:00:00Z" });
    const out = mergeHeatingLists([
      { ranked: [mid], newcomers: [older] },
      { ranked: [top, mid], newcomers: [newer] },
      { ranked: [], newcomers: [older] },
    ]);
    expect(out.ranked.map((x) => x.id)).toEqual(["top", "mid"]);
    expect(out.newcomers.map((x) => x.id)).toEqual(["newer", "older"]);
  });
});

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

describe("website check", () => {
  const ok = { contact_name: "Sam", business_name: "Sam's Heating", trade: "Gas engineer", phone: "07700 900123", email: "", link: "" };

  it("accepts the required fields and normalises the number", () => {
    const r = parseWebsiteCheck(form(ok));
    expect(r).toEqual({
      ok: true,
      data: { contact_name: "Sam", business_name: "Sam's Heating", trade: "Gas engineer", phone_e164: "+447700900123", email: null, link: null },
    });
  });

  it("names each wrong field", () => {
    const r = parseWebsiteCheck(form({ ...ok, contact_name: "", phone: "123", email: "nope" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["contact_name", "email", "phone"]);
  });

  it("emails us who asked and what to look at, escaping the HTML", () => {
    const e = websiteCheckEmail({
      contact_name: "Sam",
      business_name: "<Sam & Co>",
      trade: "Plumber",
      phone_e164: "+447700900123",
      email: null,
      link: "https://example.com",
    });
    expect(e.subject).toBe("Website check: <Sam & Co>");
    expect(e.text).toContain("Phone: +447700900123");
    expect(e.text).toContain("Website or profile: https://example.com");
    expect(e.html).toContain("&lt;Sam &amp; Co&gt;");
    expect(e.html).not.toContain("<Sam");
  });
});

describe("founding trial", () => {
  it("first charges on 1 February 2027 and says so in one sentence", async () => {
    const { FOUNDING_FIRST_CHARGE, FOUNDING_TERMS, foundingOpen } = await import("@/lib/founding");
    expect(FOUNDING_FIRST_CHARGE.at.toISOString()).toBe("2027-02-01T00:00:00.000Z");
    expect(FOUNDING_TERMS).toBe(
      "Free until 31 January 2027, then £10 a month (or £100 a year) from 1 February 2027 until you cancel. You add a card to start; cancel before 1 February 2027 and you pay nothing.",
    );
    expect(foundingOpen(new Date("2026-11-02T12:00:00Z"))).toBe(true);
    // Stripe needs the trial end at least 2 days ahead, and nobody joins a free trial that ends tomorrow.
    expect(foundingOpen(new Date("2027-01-30T12:00:00Z"))).toBe(false);
    expect(foundingOpen(new Date("2027-03-01T00:00:00Z"))).toBe(false);
  });
});
