import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const results: Record<string, { data: unknown; error: { message: string } | null }> = {};
const delivered: [string, string][] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (fn: string) => {
      calls.push(fn);
      return results[fn] ?? { data: null, error: null };
    },
  }),
}));
vi.mock("@/lib/notify", () => ({
  deliverCustomerMessage: async (kind: string, id: string) => {
    delivered.push([kind, id]);
    return 1;
  },
}));

import { GET } from "@/app/api/cron/daily/route";
import { cronAuthorised } from "@/lib/cron";

const SECRET = "s".repeat(32);
const req = (auth?: string) => new Request("http://x/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  calls.length = 0;
  delivered.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  process.env.CRON_SECRET = SECRET;
});

describe("cronAuthorised", () => {
  it("needs the exact bearer and a long enough secret", () => {
    expect(cronAuthorised(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronAuthorised(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronAuthorised(null, SECRET)).toBe(false);
    expect(cronAuthorised("Bearer short", "short")).toBe(false);
    expect(cronAuthorised(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
});

describe("GET /api/cron/daily", () => {
  it("refuses without the secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("sends payment reminders and quote follow-ups, then clears old views", async () => {
    results.due_payment_reminders = { data: [{ id: "i1", kind: "payment_reminder_1" }], error: null };
    results.due_quote_followups = { data: [{ id: "q1", kind: "quote_followup_1" }, { id: "q2", kind: "quote_followup_2" }], error: null };
    results.purge_old_page_views = { data: 3, error: null };
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      payment_reminders: { due: 1, sent: 1 },
      quote_followups: { due: 2, sent: 2 },
      purged_view_days: 3,
    });
    expect(delivered).toEqual([
      ["payment_reminder_1", "i1"],
      ["quote_followup_1", "q1"],
      ["quote_followup_2", "q2"],
    ]);
  });

  it("runs every part even when one fails, and reports the failure", async () => {
    results.due_payment_reminders = { data: null, error: { message: "down" } };
    results.due_quote_followups = { data: [], error: null };
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(calls).toEqual(["due_payment_reminders", "due_quote_followups", "purge_old_page_views"]);
    expect((await res.json()).payment_reminders).toBe("failed");
  });
});
