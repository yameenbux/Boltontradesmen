import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderCard } from "@/components/ProviderCard";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import {
  addMonths,
  availabilityLabel,
  availabilityNow,
  bookedDateProblem,
  bookedRange,
  effectiveAvailability,
  endOfWeek,
  londonToday,
  parseAvailabilityForm,
  shortDate,
  stopsShowing,
  updatedAgo,
} from "@/lib/availability";
import type { PublicProvider } from "@/lib/directory";

// Friday 16 October 2026, 10:00 in Bolton (BST, UTC+1).
const NOW = new Date("2026-10-16T09:00:00Z");
const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86_400_000).toISOString();

describe("dates", () => {
  it("today is Bolton's date, not UTC's", () => {
    expect(londonToday(NOW)).toBe("2026-10-16");
    // 23:30 UTC on the 16th is 00:30 on the 17th in Bolton during BST.
    expect(londonToday(new Date("2026-10-16T23:30:00Z"))).toBe("2026-10-17");
    // In winter (GMT) they agree.
    expect(londonToday(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });

  it("writes short UK dates like 14 Nov", () => {
    expect(shortDate("2026-11-14")).toBe("14 Nov");
    expect(shortDate("2027-01-03")).toBe("3 Jan");
    expect(shortDate("2027-09-30")).toBe("30 Sep");
  });

  it("adds months the way Postgres does, keeping to the month's last day", () => {
    expect(addMonths("2026-10-16", 6)).toBe("2027-04-16");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("finds the Sunday that ends the week", () => {
    expect(endOfWeek("2026-10-16")).toBe("2026-10-18"); // Friday
    expect(endOfWeek("2026-10-12")).toBe("2026-10-18"); // Monday
    expect(endOfWeek("2026-10-18")).toBe("2026-10-18"); // Sunday
  });

  it("Booked up until: tomorrow to 6 months ahead", () => {
    expect(bookedRange(NOW)).toEqual({ min: "2026-10-17", max: "2027-04-16" });
    expect(bookedDateProblem("2026-10-17", NOW)).toBeNull();
    expect(bookedDateProblem("2027-04-16", NOW)).toBeNull();
    expect(bookedDateProblem("2026-10-16", NOW)).toBe("Choose a date after today.");
    expect(bookedDateProblem("2025-01-01", NOW)).toBe("Choose a date after today.");
    expect(bookedDateProblem("2027-04-17", NOW)).toBe("Choose a date no more than 6 months ahead.");
    expect(bookedDateProblem("", NOW)).toBe("Choose the date you're booked up until.");
    expect(bookedDateProblem("14/11/2026", NOW)).toBe("Choose the date you're booked up until.");
  });
});

describe("expiry (the rule provider_public applies)", () => {
  it("nothing set shows nothing", () => {
    expect(effectiveAvailability(null, NOW)).toBeNull();
    expect(effectiveAvailability({ status: null, until: null, setAt: null }, NOW)).toBeNull();
  });

  it("Taking on work shows for 14 days after it was set", () => {
    const taking = (setAt: string) => effectiveAvailability({ status: "taking", until: null, setAt }, NOW);
    expect(taking(daysAgo(0))).toEqual({ status: "taking", until: null, setAt: daysAgo(0) });
    expect(taking(daysAgo(13.9))?.status).toBe("taking");
    expect(taking(daysAgo(14))).toBeNull();
    expect(taking(daysAgo(30))).toBeNull();
  });

  it("Taking on work this week ends with its week", () => {
    const thisWeek = (until: string) => effectiveAvailability({ status: "taking", until, setAt: daysAgo(1) }, NOW);
    expect(thisWeek("2026-10-18")?.until).toBe("2026-10-18");
    expect(thisWeek("2026-10-16")?.status).toBe("taking");
    expect(thisWeek("2026-10-15")).toBeNull();
  });

  it("Booked up until shows to the end of its date, however long ago it was set", () => {
    const booked = (until: string | null) => effectiveAvailability({ status: "booked", until, setAt: daysAgo(90) }, NOW);
    expect(booked("2026-11-14")).toEqual({ status: "booked", until: "2026-11-14", setAt: daysAgo(90) });
    expect(booked("2026-10-16")?.status).toBe("booked");
    expect(booked("2026-10-15")).toBeNull();
    expect(booked(null)).toBeNull();
  });

  it("an unknown status shows nothing", () => {
    expect(effectiveAvailability({ status: "maybe", until: null, setAt: daysAgo(0) }, NOW)).toBeNull();
  });
});

describe("labels", () => {
  it("says what it is", () => {
    expect(availabilityLabel({ status: "taking", until: null })).toBe("Taking on work");
    expect(availabilityLabel({ status: "taking", until: "2026-10-18" })).toBe("Taking on work this week");
    expect(availabilityLabel({ status: "booked", until: "2026-11-14" })).toBe("Booked up until 14 Nov");
  });

  it("says how fresh it is, in Bolton's days", () => {
    expect(updatedAgo(daysAgo(0), NOW)).toBe("updated today");
    // Set at 00:30 Bolton time today.
    expect(updatedAgo("2026-10-15T23:30:00Z", NOW)).toBe("updated today");
    // Set at 23:30 Bolton time yesterday.
    expect(updatedAgo("2026-10-15T22:30:00Z", NOW)).toBe("updated yesterday");
    expect(updatedAgo(daysAgo(5), NOW)).toBe("updated 5 days ago");
    expect(updatedAgo(daysAgo(13), NOW)).toBe("updated 13 days ago");
    // A clock a little ahead never says "in the future".
    expect(updatedAgo(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe("updated today");
  });
});

describe("the forms", () => {
  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.append(k, v);
    return fd;
  };

  it("reads the choice, turning this week into its Sunday", () => {
    expect(parseAvailabilityForm(form({ choice: "taking" }), NOW)).toEqual({ ok: true, choice: { status: "taking", until: null } });
    expect(parseAvailabilityForm(form({ choice: "taking", this_week: "on" }), NOW)).toEqual({
      ok: true,
      choice: { status: "taking", until: "2026-10-18" },
    });
    expect(parseAvailabilityForm(form({ choice: "booked", until: "2026-11-14" }), NOW)).toEqual({
      ok: true,
      choice: { status: "booked", until: "2026-11-14" },
    });
    expect(parseAvailabilityForm(form({ choice: "none", until: "2026-11-14" }), NOW)).toEqual({
      ok: true,
      choice: { status: null, until: null },
    });
    expect(parseAvailabilityForm(form({ choice: "booked", until: "2026-10-16" }), NOW)).toEqual({
      ok: false,
      field: "until",
      message: "Choose a date after today.",
    });
    expect(parseAvailabilityForm(form({}), NOW)).toEqual({ ok: false, field: "choice", message: "Choose one." });
  });

  it("says when it stops showing", () => {
    expect(stopsShowing({ status: "taking", until: null, setAt: "2026-10-16T09:00:00Z" })).toBe(
      "It stops showing on 30 Oct unless you set it again.",
    );
    expect(stopsShowing({ status: "taking", until: "2026-10-18", setAt: "2026-10-16T09:00:00Z" })).toBe(
      "It shows until the end of 18 Oct.",
    );
    expect(stopsShowing({ status: "booked", until: "2026-11-14", setAt: "2026-10-16T09:00:00Z" })).toBe(
      "It shows until the end of 14 Nov.",
    );
  });

  it("describes the stored value, including one that has run out", () => {
    expect(availabilityNow({ status: "taking", until: null, set_at: daysAgo(0), showing: "taking" }, NOW)).toEqual({
      showing: { status: "taking", until: null, setAt: daysAgo(0) },
      updated: "updated today",
      ends: "It stops showing on 30 Oct unless you set it again.",
      expired: false,
    });
    expect(availabilityNow({ status: "taking", until: null, set_at: daysAgo(20), showing: null }, NOW)).toEqual({
      showing: null,
      updated: null,
      ends: null,
      expired: true,
    });
    expect(availabilityNow(undefined, NOW)).toEqual({ showing: null, updated: null, ends: null, expired: false });
  });
});

describe("the chip on cards and profiles", () => {
  const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const provider = (over: Partial<PublicProvider> = {}): PublicProvider => ({
    id: "p1",
    slug: "ace",
    businessName: "Ace Plumbing",
    contactName: null,
    areas: ["BL1"],
    bio: null,
    isVerified: false,
    hasWhatsapp: false,
    categorySlugs: ["plumber"],
    checks: [],
    reviewCount: 0,
    useAgainPct: null,
    onTimePct: null,
    onPricePct: null,
    tidyPct: null,
    score: null,
    lastReviewAt: null,
    createdAt: "2026-10-01T10:00:00Z",
    verifiedJobCount: 0,
    availability: null,
    idChecked: false,
    photos: [],
    takesRequests: false,
    ...over,
  });
  const header = (availability?: PublicProvider["availability"]) =>
    renderToString(
      createElement(ProfileHeader, {
        businessName: "Ace Plumbing",
        contactName: null,
        trades: ["Plumber"],
        isVerified: true,
        badge: null,
        areas: ["BL1"],
        availability,
      }),
    );

  it("shows Taking on work or Booked up until on a card, and nothing when not set", () => {
    const taking = renderToString(
      createElement(ProviderCard, { provider: provider({ availability: { status: "taking", until: null, setAt: daysAgo(1) } }) }),
    );
    expect(taking).toContain('data-testid="availability"');
    expect(text(taking)).toContain("Taking on work");
    const booked = renderToString(
      createElement(ProviderCard, {
        provider: provider({ isVerified: true, availability: { status: "booked", until: "2026-11-14", setAt: daysAgo(1) } }),
      }),
    );
    expect(text(booked)).toContain("Verified Booked up until 14 Nov");
    expect(renderToString(createElement(ProviderCard, { provider: provider() }))).not.toContain("availability");
  });

  it("the profile adds how fresh it is", () => {
    expect(text(header({ status: "taking", until: null, setAt: new Date().toISOString() }))).toContain(
      "Taking on work · updated today",
    );
    expect(header()).not.toContain("availability");
  });
});
