import { describe, expect, it } from "vitest";
import { BIO_MAX, LINK_IN_TEXT, LISTING_ERRORS, parseListingEdit } from "@/lib/listing-edit";

const form = (bio: string, areas: string[]) => {
  const fd = new FormData();
  fd.set("bio", bio);
  for (const a of areas) fd.append("areas", a);
  return fd;
};

describe("parseListingEdit", () => {
  it("trims the bio and keeps areas in the list's order", () => {
    expect(parseListingEdit(form("  Boilers and bathrooms.  ", ["BL3", "bl1", "BL1"]))).toEqual({
      ok: true,
      value: { bio: "Boilers and bathrooms.", areas: ["BL1", "BL3"] },
    });
  });

  it("an empty bio is none", () => {
    expect(parseListingEdit(form("   ", ["WN2"]))).toEqual({ ok: true, value: { bio: null, areas: ["WN2"] } });
  });

  it(`allows ${BIO_MAX} characters, not one more`, () => {
    expect(parseListingEdit(form("a".repeat(BIO_MAX), ["BL1"])).ok).toBe(true);
    expect(parseListingEdit(form("a".repeat(BIO_MAX + 1), ["BL1"]))).toEqual({
      ok: false,
      errors: { bio: LISTING_ERRORS.bio_too_long.message },
    });
  });

  it("refuses phone numbers however they're written (the review comment rule)", () => {
    for (const bio of ["Ring 07700 900123", "Call (01204) 555-019", "+44 7700 900 123"]) {
      expect(parseListingEdit(form(bio, ["BL1"]))).toEqual({ ok: false, errors: { bio: LISTING_ERRORS.bio_has_phone.message } });
    }
  });

  it("refuses web and email addresses", () => {
    for (const bio of ["See www.example.org", "https://example.org", "acme-plumbing.co.uk", "tara@example", "Bolton.com"]) {
      expect(LINK_IN_TEXT.test(bio), bio).toBe(true);
      expect(parseListingEdit(form(bio, ["BL1"])).ok, bio).toBe(false);
    }
  });

  it("allows ordinary sentences with full stops and short numbers", () => {
    for (const bio of ["Est. 1998. Gas safe. 24 hr call-outs, 7 days.", "Kitchens, bathrooms etc. Free quotes.", "No job too small.Honest prices."]) {
      expect(parseListingEdit(form(bio, ["BL1"])).ok, bio).toBe(true);
    }
  });

  it("needs at least one area, from the list", () => {
    expect(parseListingEdit(form("Hi", []))).toEqual({ ok: false, errors: { areas: LISTING_ERRORS.areas_required.message } });
    expect(parseListingEdit(form("Hi", ["BL1", "M27"]))).toEqual({ ok: false, errors: { areas: LISTING_ERRORS.bad_area.message } });
    expect(parseListingEdit(form("Hi", ["OTHER"])).ok).toBe(false);
  });

  it("reports both fields at once", () => {
    const r = parseListingEdit(form("www.x.com", []));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["areas", "bio"]);
  });
});
