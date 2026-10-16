import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ProSoonCard } from "@/components/provider/ProOffer";
import { toEnquiryStats } from "@/lib/enquiries";
import {
  isProStatus,
  monthlyReport,
  planForPrice,
  stripeConfig,
  subscriptionLine,
  toProStatus,
  toPublicPhotos,
  webhookSecret,
  workPhotoUrl,
} from "@/lib/pro";

const FULL = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_MONTHLY: "price_month",
  STRIPE_PRICE_ANNUAL: "price_year",
};

describe("Stripe settings: Pro only opens with all four", () => {
  it("is configured with all four", () => {
    expect(stripeConfig(FULL)).toEqual({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_x",
      prices: { monthly: "price_month", annual: "price_year" },
    });
  });

  it.each(Object.keys(FULL))("is not configured without %s (or with it blank)", (key) => {
    expect(stripeConfig({ ...FULL, [key]: undefined })).toBeNull();
    expect(stripeConfig({ ...FULL, [key]: "  " })).toBeNull();
  });

  it("with nothing set (production before Stripe), nothing is configured", () => {
    expect(stripeConfig({})).toBeNull();
    expect(webhookSecret({})).toBeNull();
    expect(webhookSecret({ STRIPE_WEBHOOK_SECRET: " whsec_y " })).toBe("whsec_y");
  });

  it("the 'opens soon' card has nothing to buy: no form, button or link", () => {
    const html = renderToString(createElement(ProSoonCard));
    expect(html).toContain("Pro opens soon");
    expect(html).toContain("£10 a month or £100 a year");
    expect(html).not.toMatch(/<(form|button|a)\b/);
  });
});

describe("plan mapping", () => {
  it("maps our two prices", () => {
    expect(planForPrice("price_month", null, FULL)).toBe("monthly");
    expect(planForPrice("price_year", null, FULL)).toBe("annual");
  });
  it("falls back to the billing interval", () => {
    expect(planForPrice("price_other", "month", FULL)).toBe("monthly");
    expect(planForPrice("price_other", "year", {})).toBe("annual");
  });
  it("anything else is not ours", () => {
    expect(planForPrice("price_other", "week", FULL)).toBeNull();
    expect(planForPrice(null, null, FULL)).toBeNull();
  });
});

describe("is_pro's rules (the same as private.is_pro)", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  it("active and trialing are Pro", () => {
    expect(isProStatus("active", null, now)).toBe(true);
    expect(isProStatus("trialing", daysAgo(-3), now)).toBe(true);
  });
  it("past due is Pro for 14 days after the period ended, then not", () => {
    expect(isProStatus("past_due", daysAgo(13), now)).toBe(true);
    expect(isProStatus("past_due", daysAgo(15), now)).toBe(false);
    expect(isProStatus("past_due", null, now)).toBe(false);
  });
  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"])("%s is not Pro", (s) => {
    expect(isProStatus(s, daysAgo(-10), now)).toBe(false);
  });
});

describe("work photos", () => {
  const path = "0b8e1f0a-1111-4222-8333-444455556666/1c2d3e4f-aaaa-4bbb-8ccc-ddddeeeeffff.webp";
  it("public URL from the Supabase origin", () => {
    expect(workPhotoUrl(path, { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/" })).toBe(
      `https://abc.supabase.co/storage/v1/object/public/work-photos/${path}`,
    );
    expect(workPhotoUrl(path, {})).toBeNull();
  });
  it("only well-formed paths reach the page, at most 6", () => {
    const ok = { path, width: 1600, height: 1200 };
    expect(toPublicPhotos([ok, { path: "../etc/passwd" }, { path: 3 }, null])).toEqual([ok]);
    expect(toPublicPhotos(Array(8).fill(ok))).toHaveLength(6);
    expect(toPublicPhotos("nope")).toEqual([]);
  });
});

describe("the trader's Pro status", () => {
  it("reads my_pro_status safely", () => {
    const s = toProStatus({
      is_pro: true,
      subscription: { plan: "annual", status: "active", current_period_end: "2027-10-16T00:00:00Z", cancel_at_period_end: false },
      id_check: { status: "pending" },
      documents: [{ id: "d1", kind: "photo_id", status: "pending", created_at: "2026-10-16T10:00:00Z" }, { id: "d2", kind: "x" }],
      photos: [{ id: "p1", path: "a/b.webp", width: 10, height: 20, position: 1 }],
    });
    expect(s.isPro).toBe(true);
    expect(s.subscription?.plan).toBe("annual");
    expect(s.idCheck.status).toBe("pending");
    expect(s.documents.map((d) => d.id)).toEqual(["d1"]);
    expect(s.photos).toHaveLength(1);
    expect(toProStatus(null)).toMatchObject({ isPro: false, subscription: null, idCheck: { status: "none" }, photos: [] });
  });

  it("says what's happening in plain words", () => {
    const sub = { plan: "monthly" as const, status: "active", currentPeriodEnd: "2026-11-16T10:00:00Z", cancelAtPeriodEnd: false, graceUntil: null };
    expect(subscriptionLine(sub, true)).toEqual({ tone: "ok", text: "Pro is on (£10 a month). It renews on 16 November 2026." });
    expect(subscriptionLine({ ...sub, cancelAtPeriodEnd: true }, true).text).toMatch(/^Cancelled\. Pro stays on until 16 November 2026/);
    expect(subscriptionLine({ ...sub, status: "past_due", graceUntil: "2026-11-30T10:00:00Z" }, true).text).toContain("by 30 November 2026");
    expect(subscriptionLine({ ...sub, status: "canceled" }, false).tone).toBe("off");
  });
});

describe("monthly report (by month: taps carry no district)", () => {
  const stats = toEnquiryStats({
    this_month: { enquiries: 1, calls: 1, whatsapps: 0 },
    all_time: { enquiries: 13, calls: 8, whatsapps: 5 },
    months: [
      { month: "2026-05-01", enquiries: 0, calls: 0, whatsapps: 0 },
      { month: "2026-06-01", enquiries: 4, calls: 3, whatsapps: 1 },
      { month: "2026-07-01", enquiries: 1, calls: 1, whatsapps: 0 },
      { month: "2026-08-01", enquiries: 2, calls: 1, whatsapps: 1 },
      { month: "2026-09-01", enquiries: 5, calls: 2, whatsapps: 3 },
      { month: "2026-10-01", enquiries: 1, calls: 1, whatsapps: 0 },
    ],
  });
  it("reports last full month against the month before, and the busiest", () => {
    expect(monthlyReport(stats)).toEqual({
      month: "2026-09-01",
      label: "September 2026",
      enquiries: 5,
      calls: 2,
      whatsapps: 3,
      change: 3,
      previousLabel: "August 2026",
      busiest: { label: "September 2026", enquiries: 5 },
    });
  });
  it("needs at least last month", () => {
    expect(monthlyReport(toEnquiryStats({ months: [{ month: "2026-10-01", enquiries: 1 }] }))).toBeNull();
  });
});
