import { describe, expect, it } from "vitest";
import { chaseText, chaseWhatsApp, quotesToChase, toInsights } from "@/lib/insights";
import type { TradeDoc } from "@/lib/trade-docs";

const doc = (o: Partial<TradeDoc> = {}): TradeDoc => ({
  id: "d1",
  kind: "quote",
  number: 3,
  token: "t1",
  status: "sent",
  customer_name: "Cal Chapman",
  customer_phone: "+447700900123",
  customer_email: null,
  title: "New tap",
  lines: [],
  total_pence: 16500,
  notes: null,
  until: null,
  ask_review: true,
  job_request_id: null,
  quote_id: null,
  invoice_id: null,
  created_at: "2026-10-20T10:00:00Z",
  sent_at: "2026-10-20T10:00:00Z",
  answered_at: null,
  paid_at: null,
  ...o,
});

describe("toInsights", () => {
  it("reads views and the Pro demand report", () => {
    expect(
      toInsights({
        views: { this_month: 12, last_month: "5", months: [] },
        pro: true,
        demand: { days: 30, trades: [{ slug: "plumber", name: "Plumber", page_views: 52, questions: 3 }] },
      }),
    ).toEqual({
      views: { thisMonth: 12, lastMonth: 5 },
      pro: true,
      demand: [{ slug: "plumber", name: "Plumber", pageViews: 52, questions: 3 }],
    });
  });

  it("is safe with missing or odd values, and has no demand without Pro", () => {
    expect(toInsights(null)).toEqual({ views: { thisMonth: 0, lastMonth: 0 }, pro: false, demand: null });
    expect(toInsights({ views: { this_month: -3 }, pro: false, demand: null }).views.thisMonth).toBe(0);
  });
});

describe("quotesToChase", () => {
  const now = new Date("2026-10-27T12:00:00Z");

  it("lists sent, unanswered, open quotes 3 or more days old, oldest first", () => {
    const docs = [
      doc({ id: "new", sent_at: "2026-10-26T09:00:00Z" }),
      doc({ id: "old", sent_at: "2026-10-17T09:00:00Z" }),
      doc({ id: "mid", sent_at: "2026-10-23T09:00:00Z" }),
      doc({ id: "answered", status: "accepted" }),
      doc({ id: "expired", until: "2026-10-26" }),
      doc({ id: "open", until: "2026-10-27" }),
      doc({ id: "invoice", kind: "invoice", status: "unpaid" }),
      doc({ id: "draft", status: "draft", sent_at: null }),
    ];
    expect(quotesToChase(docs, now).map((c) => [c.doc.id, c.days])).toEqual([
      ["old", 10],
      ["open", 7],
      ["mid", 4],
    ]);
  });
});

describe("chase message", () => {
  it("greets by first name and links the quote", () => {
    expect(chaseText(doc(), "Ace Plumbing", "https://x.test/d/t1")).toBe(
      "Hi Cal, just checking you got my quote Q-0003 for New tap (£165.00). You can accept it here: https://x.test/d/t1\nAny questions, just ask. Ace Plumbing",
    );
  });

  it("opens WhatsApp to a UK mobile with the message filled in", () => {
    const link = chaseWhatsApp(doc(), "Ace", "https://x.test/d/t1");
    expect(link).toMatch(/^https:\/\/wa\.me\/447700900123\?text=Hi%20Cal%2C/);
  });

  it("has no WhatsApp link without a mobile", () => {
    expect(chaseWhatsApp(doc({ customer_phone: null }), "Ace", "l")).toBeNull();
    expect(chaseWhatsApp(doc({ customer_phone: "+441204123456" }), "Ace", "l")).toBeNull();
  });
});
