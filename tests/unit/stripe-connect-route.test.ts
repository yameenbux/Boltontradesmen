import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recorded: [string, string][] = [];
const stored: string[] = [];
const reviews: string[] = [];
let recordResult: { result: string; ask_review?: boolean } | null = { result: "recorded", ask_review: true };

vi.mock("@/lib/card-payments", () => ({
  recordPaidSession: async (s: { id: string }, account: string) => (recorded.push([s.id, account]), recordResult),
  storeAccount: async (a: { id: string }) => void stored.push(a.id),
}));
vi.mock("@/lib/notify", () => ({ deliverCustomerMessage: async (_k: string, id: string) => (reviews.push(id), 1) }));

import { POST } from "@/app/api/stripe/connect/route";

const SECRET = "whsec_connect_test_secret";
const signer = new Stripe("sk_test_dummy");

function req(event: Record<string, unknown>, sign = true) {
  const payload = JSON.stringify({ id: "evt_1", object: "event", ...event });
  const headers: Record<string, string> = {};
  if (sign) headers["stripe-signature"] = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return new Request("http://x/api/stripe/connect", { method: "POST", body: payload, headers });
}

beforeEach(() => {
  recorded.length = 0;
  stored.length = 0;
  reviews.length = 0;
  recordResult = { result: "recorded", ask_review: true };
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = SECRET;
});

describe("POST /api/stripe/connect", () => {
  it("refuses an unsigned or wrongly signed call", async () => {
    expect((await POST(req({ type: "account.updated" }, false))).status).toBe(400);
    const bad = new Request("http://x", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=nope" } });
    expect((await POST(bad)).status).toBe(400);
  });

  it("is off without its secret", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    expect((await POST(req({ type: "account.updated" }))).status).toBe(503);
  });

  it("records a paid checkout on a trader's account and asks for a review", async () => {
    const res = await POST(
      req({
        type: "checkout.session.completed",
        account: "acct_1Trader",
        data: { object: { id: "cs_test_9", object: "checkout.session", metadata: { doc_id: "doc-9" } } },
      }),
    );
    expect(res.status).toBe(200);
    expect(recorded).toEqual([["cs_test_9", "acct_1Trader"]]);
    expect(reviews).toEqual(["doc-9"]);
  });

  it("asks for no review when the payment was already recorded", async () => {
    recordResult = { result: "already" };
    await POST(req({ type: "checkout.session.completed", account: "acct_1T", data: { object: { id: "cs_test_8", metadata: { doc_id: "d" } } } }));
    expect(reviews).toEqual([]);
  });

  it("keeps an account's state current", async () => {
    await POST(req({ type: "account.updated", account: "acct_1T", data: { object: { id: "acct_1T", object: "account" } } }));
    expect(stored).toEqual(["acct_1T"]);
  });
});
