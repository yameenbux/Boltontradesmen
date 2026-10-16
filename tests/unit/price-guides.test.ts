import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRICE_BAND_LABELS,
  PRICE_GUIDE_MIN_REVIEWS,
  formatJobMonth,
  guideDescription,
  guideQuestion,
  guideSource,
  joinBands,
  mostCommonBands,
  percent,
  toPriceGuide,
  tradeLower,
  tradeWords,
} from "@/lib/price-guides";

const row = (over: Record<string, unknown> = {}) => ({
  category_slug: "man-and-van",
  category_name: "Man & van",
  group_slug: "moving-waste",
  group_name: "Moving & waste",
  review_count: 10,
  band_under_250: 6,
  band_250_1k: 3,
  band_1k_5k: 1,
  band_over_5k: 0,
  on_price_pct: 80,
  earliest_job_month: "2025-03-01",
  latest_job_month: "2026-09-01",
  ...over,
});

describe("price guide threshold", () => {
  it("is 10, the same number the migration stores and floors at", () => {
    expect(PRICE_GUIDE_MIN_REVIEWS).toBe(10);
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261012000032_price_guides.sql"), "utf8");
    expect(sql).toContain(`('price_guide_min_reviews', '${PRICE_GUIDE_MIN_REVIEWS}'::jsonb)`);
    expect(sql).toContain(`greatest(${PRICE_GUIDE_MIN_REVIEWS}, coalesce(v, ${PRICE_GUIDE_MIN_REVIEWS}))`);
  });

  it("drops a row below it, or one whose bands don't add up", () => {
    expect(toPriceGuide(row())).not.toBeNull();
    expect(toPriceGuide(row({ review_count: 9, band_under_250: 5 }))).toBeNull();
    expect(toPriceGuide(row({ band_over_5k: 1 }))).toBeNull();
  });

  it("maps the view's columns", () => {
    expect(toPriceGuide(row())).toEqual({
      slug: "man-and-van",
      name: "Man & van",
      groupSlug: "moving-waste",
      groupName: "Moving & waste",
      reviewCount: 10,
      bands: { "<250": 6, "250-1k": 3, "1k-5k": 1, "5k+": 0 },
      onPricePct: 80,
      earliestJobMonth: "2025-03-01",
      latestJobMonth: "2026-09-01",
    });
  });
});

describe("band labels", () => {
  it("reads as totals in pounds", () => {
    expect(PRICE_BAND_LABELS).toEqual({
      "<250": "Under £250",
      "250-1k": "£250–£1,000",
      "1k-5k": "£1,000–£5,000",
      "5k+": "Over £5,000",
    });
  });
});

describe("mostCommonBands", () => {
  it("is the band most people picked", () => {
    expect(mostCommonBands({ "<250": 6, "250-1k": 3, "1k-5k": 1, "5k+": 0 })).toEqual(["<250"]);
  });
  it("shows every band in a tie, in price order", () => {
    expect(mostCommonBands({ "<250": 1, "250-1k": 4, "1k-5k": 4, "5k+": 1 })).toEqual(["250-1k", "1k-5k"]);
    expect(joinBands(["250-1k", "1k-5k"])).toBe("£250–£1,000 and £1,000–£5,000");
    expect(joinBands(["<250", "250-1k", "5k+"])).toBe("Under £250, £250–£1,000 and Over £5,000");
  });
  it("is nothing when nobody answered", () => {
    expect(mostCommonBands({ "<250": 0, "250-1k": 0, "1k-5k": 0, "5k+": 0 })).toEqual([]);
  });
});

describe("percent", () => {
  it("rounds to a whole per cent, half up", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(1, 8)).toBe(13);
    expect(percent(5, 10)).toBe(50);
    expect(percent(0, 10)).toBe(0);
    expect(percent(3, 0)).toBe(0);
  });
});

describe("wording", () => {
  it("asks the question in plain words", () => {
    expect(guideQuestion({ slug: "man-and-van", name: "Man & van" })).toBe("How much does a man and van cost in Bolton?");
    expect(guideQuestion({ slug: "electrician", name: "Electrician" })).toBe("How much does an electrician cost in Bolton?");
    expect(guideQuestion({ slug: "pest-control", name: "Pest control" })).toBe("How much does pest control cost in Bolton?");
    expect(guideQuestion({ slug: "window-cleaner", name: "Window cleaner" })).toBe(
      "How much does a window cleaner cost in Bolton?",
    );
  });

  it("has plurals for the listing link, including trades added later", () => {
    expect(tradeWords("handyman", "Handyman").many).toBe("handymen");
    expect(tradeWords("oven-cleaning", "Oven & hob cleaner")).toEqual({ one: "an oven and hob cleaner", many: "oven and hob cleaners" });
  });

  it("keeps capitals where they belong", () => {
    expect(tradeLower("Man & van")).toBe("man & van");
    expect(tradeLower("MOT")).toBe("MOT");
    expect(tradeLower("DJ")).toBe("DJ");
  });

  it("says where the numbers come from", () => {
    const g = toPriceGuide(row())!;
    expect(formatJobMonth("2025-03-01")).toBe("March 2025");
    expect(guideSource(g)).toBe("from 10 reviews of man & van jobs since March 2025");
    expect(guideDescription(g)).toBe(
      "What Bolton residents paid, from 10 reviews of man & van jobs since March 2025. 80% said the price matched the quote. Most often: Under £250.",
    );
    expect(guideDescription(toPriceGuide(row({ band_under_250: 3, band_250_1k: 3, band_1k_5k: 3, band_over_5k: 1 }))!)).toContain(
      "Most often: Under £250, £250–£1,000 and £1,000–£5,000.",
    );
  });

  it("never claims an average, an hourly rate or a national figure", () => {
    const text = guideDescription(toPriceGuide(row())!).toLowerCase();
    for (const word of ["average", "per hour", "/hour", "hourly", "uk", "national"]) expect(text).not.toContain(word);
  });
});
