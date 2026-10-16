import { describe, expect, it } from "vitest";
import { chartBars, plural, PRO_ENQUIRY_THRESHOLD, proProgress, toEnquiryStats } from "@/lib/enquiries";

const month = (m: string, enquiries: number, calls = enquiries, whatsapps = 0) => ({ month: m, enquiries, calls, whatsapps });

describe("toEnquiryStats", () => {
  it("reads the RPC's JSON", () => {
    const s = toEnquiryStats({
      this_month: { enquiries: 3, calls: 2, whatsapps: 1 },
      all_time: { enquiries: 6, calls: 4, whatsapps: 2 },
      months: [month("2026-05-01", 0), month("2026-10-01", 3, 2, 1)],
      reviews_this_month: 1,
    });
    expect(s.thisMonth).toEqual({ enquiries: 3, calls: 2, whatsapps: 1 });
    expect(s.allTime).toEqual({ enquiries: 6, calls: 4, whatsapps: 2 });
    expect(s.months).toHaveLength(2);
    expect(s.months[1]).toEqual({ month: "2026-10-01", enquiries: 3, calls: 2, whatsapps: 1 });
    expect(s.reviewsThisMonth).toBe(1);
  });

  it("turns missing or odd values into zeros and drops bad months", () => {
    const s = toEnquiryStats({ this_month: { enquiries: "3", calls: -1 }, months: [{ month: "May" }, null, 4] });
    expect(s.thisMonth).toEqual({ enquiries: 0, calls: 0, whatsapps: 0 });
    expect(s.allTime).toEqual({ enquiries: 0, calls: 0, whatsapps: 0 });
    expect(s.months).toEqual([]);
    expect(toEnquiryStats(null).reviewsThisMonth).toBe(0);
  });
});

describe("plural", () => {
  it("says 1 enquiry, 0 and 2 enquiries", () => {
    expect(plural(1, "enquiry", "enquiries")).toBe("1 enquiry");
    expect(plural(0, "enquiry", "enquiries")).toBe("0 enquiries");
    expect(plural(2, "WhatsApp", "WhatsApps")).toBe("2 WhatsApps");
  });
});

describe("chartBars", () => {
  const months = [
    month("2026-05-01", 0),
    month("2026-06-01", 1),
    month("2026-07-01", 4, 3, 1),
    month("2026-08-01", 2),
    month("2026-09-01", 0),
    month("2026-10-01", 3, 2, 1),
  ];

  it("labels each month in words, with the numbers for screen readers", () => {
    const bars = chartBars(months);
    expect([bars[0].short, bars[2].short, bars[5].short]).toEqual(["May", "Jul", "Oct"]);
    expect(bars[2].long).toBe("July 2026");
    expect(bars[2].label).toBe("July 2026: 4 enquiries (3 calls, 1 WhatsApp)");
    expect(bars[0].label).toBe("May 2026: 0 enquiries");
    expect(bars[1].label).toBe("June 2026: 1 enquiry (1 call, 0 WhatsApps)");
  });

  it("scales heights to the busiest month; empty months have no bar, small ones a sliver", () => {
    const bars = chartBars(months);
    expect(bars.map((b) => b.height)).toEqual([0, 25, 100, 50, 0, 75]);
    expect(chartBars([month("2026-10-01", 1), month("2026-11-01", 100)])[0].height).toBe(4);
  });

  it("marks the last month as this month", () => {
    expect(chartBars(months).map((b) => b.current)).toEqual([false, false, false, false, false, true]);
  });

  it("an all-quiet half-year has no bars at all", () => {
    expect(chartBars(months.map((m) => ({ ...m, enquiries: 0 }))).every((b) => b.height === 0)).toBe(true);
  });
});

describe("proProgress", () => {
  it("counts towards the threshold, a named constant of 5", () => {
    expect(PRO_ENQUIRY_THRESHOLD).toBe(5);
    expect(proProgress(3)).toEqual({ count: 3, of: 5, reached: false, percent: 60 });
    expect(proProgress(0)).toEqual({ count: 0, of: 5, reached: false, percent: 0 });
  });

  it("is reached at 5 and stays at 5 of 5 past it", () => {
    expect(proProgress(5)).toEqual({ count: 5, of: 5, reached: true, percent: 100 });
    expect(proProgress(12)).toEqual({ count: 5, of: 5, reached: true, percent: 100 });
  });
});
