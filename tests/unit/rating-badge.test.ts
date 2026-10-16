import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ProviderCard } from "@/components/ProviderCard";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { RatingBadge } from "@/components/RatingBadge";
import type { PublicProvider } from "@/lib/directory";

const provider = (over: Partial<PublicProvider> = {}): PublicProvider => ({
  id: "p1",
  slug: "ace",
  businessName: "Ace Plumbing",
  contactName: null,
  areas: ["BL1"],
  bio: null,
  isVerified: true,
  hasWhatsapp: false,
  categorySlugs: ["plumber"],
  checks: [],
  reviewCount: 6,
  useAgainPct: 100,
  onTimePct: 100,
  onPricePct: 100,
  tidyPct: 100,
  score: 4.6,
  lastReviewAt: null,
  createdAt: "2026-10-01T10:00:00Z",
  verifiedJobCount: 0,
  availability: null,
  ...over,
});

const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("RatingBadge", () => {
  it("always shows its words, with the star hidden from screen readers", () => {
    const html = renderToString(createElement(RatingBadge, { badge: "top" }));
    expect(text(html)).toBe("Top rated");
    expect(html).toContain('class="pill pill-top"');
    expect(html).toContain('aria-hidden="true"');
    expect(text(renderToString(createElement(RatingBadge, { badge: "high" })))).toBe("Highly rated");
  });
});

describe("ProviderCard badge", () => {
  it("shows Top rated next to Verified when earned", () => {
    expect(text(renderToString(createElement(ProviderCard, { provider: provider() })))).toContain("Verified Top rated");
  });

  it("shows Highly rated a step down, and on an unverified listing", () => {
    const p = provider({ isVerified: false, score: 4.1, useAgainPct: 85 });
    const html = renderToString(createElement(ProviderCard, { provider: p }));
    expect(text(html)).toContain("Highly rated");
    expect(text(html)).not.toContain("Verified");
  });

  it("shows nothing under 5 reviews, however good", () => {
    const html = renderToString(createElement(ProviderCard, { provider: provider({ reviewCount: 4 }) }));
    expect(html).not.toContain("rating-badge");
    expect(text(html)).not.toMatch(/Top rated|Highly rated/);
  });
});

describe("ProfileHeader badge", () => {
  const props = { businessName: "Ace Plumbing", contactName: null, trades: ["Plumber"], isVerified: false, areas: [] };
  it("shows the badge it is given, even with no Verified pill or areas", () => {
    expect(text(renderToString(createElement(ProfileHeader, { ...props, badge: "top" })))).toContain("Top rated");
  });
  it("shows none without one", () => {
    expect(renderToString(createElement(ProfileHeader, { ...props, badge: null }))).not.toContain("rating-badge");
  });
});
