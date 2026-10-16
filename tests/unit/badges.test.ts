import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import HowRatingsWork from "@/app/(info)/how-ratings-work/page";
import {
  BADGE_LABEL,
  BADGE_MIN_REVIEWS,
  HIGHLY_RATED_MIN_SCORE,
  HIGHLY_RATED_MIN_USE_AGAIN,
  ratingBadge,
  shownQuality,
  TOP_RATED_MIN_SCORE,
  TOP_RATED_MIN_USE_AGAIN,
} from "@/lib/badges";

const stats = (reviewCount: number, score: number | null, useAgainPct: number | null) => ({
  reviewCount,
  score,
  useAgainPct,
});

describe("badge rules (owner decision)", () => {
  it("are the published numbers", () => {
    expect(BADGE_MIN_REVIEWS).toBe(5);
    expect([TOP_RATED_MIN_SCORE, TOP_RATED_MIN_USE_AGAIN]).toEqual([4.5, 90]);
    expect([HIGHLY_RATED_MIN_SCORE, HIGHLY_RATED_MIN_USE_AGAIN]).toEqual([4.0, 80]);
    expect(BADGE_LABEL).toEqual({ top: "Top rated", high: "Highly rated" });
  });
});

describe("ratingBadge", () => {
  it("needs 5 counted reviews: 4 earns nothing, 5 can", () => {
    expect(ratingBadge(stats(4, 5, 100))).toBeNull();
    expect(ratingBadge(stats(5, 5, 100))).toBe("top");
    expect(ratingBadge(stats(0, null, null))).toBeNull();
  });

  it("gives Top rated at 4.5 and 90%, and not just below either", () => {
    expect(ratingBadge(stats(5, 4.5, 90))).toBe("top");
    expect(ratingBadge(stats(5, 4.5, 89))).toBe("high");
    expect(ratingBadge(stats(5, 4.4, 90))).toBe("high");
    expect(ratingBadge(stats(12, 4.9, 100))).toBe("top");
  });

  it("judges the score as shown, to 1 decimal place", () => {
    // 4.49 is shown as "4.5", so it is held to the 4.5 rule; 4.44 is shown as "4.4".
    expect(ratingBadge(stats(5, 4.49, 90))).toBe("top");
    expect(ratingBadge(stats(5, 4.44, 95))).toBe("high");
    expect(ratingBadge(stats(5, 3.96, 85))).toBe("high");
    expect(ratingBadge(stats(5, 3.94, 85))).toBeNull();
  });

  it("gives Highly rated at 4.0 and 80%, and nothing just below either", () => {
    expect(ratingBadge(stats(5, 4.0, 80))).toBe("high");
    expect(ratingBadge(stats(5, 4.0, 79))).toBeNull();
    expect(ratingBadge(stats(5, 3.9, 80))).toBeNull();
    expect(ratingBadge(stats(5, 4.8, 79))).toBeNull();
  });

  it("gives nothing when a figure is missing or not a number", () => {
    expect(ratingBadge(stats(6, null, 95))).toBeNull();
    expect(ratingBadge(stats(6, 4.8, null))).toBeNull();
    expect(ratingBadge(stats(6, Number.NaN, 95))).toBeNull();
    expect(ratingBadge(stats(Number.NaN, 4.8, 95))).toBeNull();
  });

  it("never gives more than one badge, and only ever a positive one", () => {
    const seen = new Set<string | null>();
    for (let n = 0; n <= 8; n++)
      for (let s = 1; s <= 5; s += 0.05)
        for (let u = 0; u <= 100; u += 5) seen.add(ratingBadge(stats(n, s, u)));
    expect([...seen].sort()).toEqual(["high", "top", null].sort());
  });
});

describe("shownQuality", () => {
  it("matches the profile's 1-decimal score", () => {
    expect(shownQuality(4.4666)).toBe("4.5");
    expect(shownQuality(4)).toBe("4.0");
  });
});

describe("How ratings work explains the badges", () => {
  it("states the exact rules, that they're earned from reviews only and can't be bought", () => {
    const text = renderToString(createElement(HowRatingsWork))
      .replace(/<!--.*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/\s+/g, " ");
    expect(text).toContain("Badges");
    expect(text).toContain("A provider with 5 or more reviews that count can earn one badge");
    expect(text).toContain("Top rated: a quality score of 4.5 or more and 90% or more would use them again.");
    expect(text).toContain("Highly rated: a quality score of 4.0 or more and 80% or more would use them again.");
    expect(text).toContain("earned from residents' reviews alone");
    expect(text).toContain("can lose one as well as gain one");
    expect(text).toContain("Nobody can buy a badge or pay for one");
  });
});
