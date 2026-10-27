import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcs: [string, unknown][] = [];
const rpcResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const stripeCalls: [string, unknown, unknown?][] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcs.push([fn, args]);
      return rpcResults[fn] ?? { data: null, error: null };
    },
  }),
}));
vi.mock("@/lib/stripe", () => {
  const client = {
    accounts: {
      create: async (p: unknown) => (stripeCalls.push(["accounts.create", p]), { id: "acct_1NewOne" }),
      retrieve: async (id: string) => (stripeCalls.push(["accounts.retrieve", id]), { id, charges_enabled: true, details_submitted: true }),
    },
    accountLinks: { create: async (p: unknown) => (stripeCalls.push(["accountLinks.create", p]), { url: "https://connect.stripe.test/setup" }) },
    checkout: {
      sessions: {
        create: async (p: unknown, o: unknown) => (stripeCalls.push(["sessions.create", p, o]), { url: "https://checkout.stripe.test/pay" }),
        retrieve: async (id: string, _p: unknown, o: unknown) => (
          stripeCalls.push(["sessions.retrieve", id, o]),
          { id, payment_status: "paid", amount_total: 8000, metadata: { doc_id: "doc-1", what: "invoice" } }
        ),
      },
    },
  };
  return { stripeClient: () => client, stripeVerifier: () => client };
});

import { cardCheckoutUrl, confirmReturn, onboardingUrl, recordPaidSession, type CardPayment } from "@/lib/card-payments";

const cfg = { secretKey: "sk_test_x", webhookSecret: "whsec_x", prices: { monthly: "p1", annual: "p2" } };
const pay: CardPayment = {
  doc_id: "doc-1",
  what: "invoice",
  amount_pence: 8000,
  account_id: "acct_1Trader",
  token: "00000000-0000-0000-0000-0000000000aa",
  label: "INV-0001",
  business_name: "Ace Plumbing",
};

beforeEach(() => {
  rpcs.length = 0;
  stripeCalls.length = 0;
  for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.boltonvouched.co.uk";
});

describe("onboardingUrl", () => {
  it("creates the trader's own full Stripe account once, then a setup link", async () => {
    rpcResults.set_stripe_account = { data: "acct_1NewOne", error: null };
    const url = await onboardingUrl(cfg, { providerId: "p1", email: "t@example.com", slug: "ace" });
    expect(url).toBe("https://connect.stripe.test/setup");
    const create = stripeCalls.find((c) => c[0] === "accounts.create")?.[1] as Record<string, unknown>;
    expect(create.country).toBe("GB");
    // They pay Stripe's fee and own their disputes; we never take a cut.
    expect(create.controller).toEqual({
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
      stripe_dashboard: { type: "full" },
    });
    expect(JSON.stringify(create)).not.toMatch(/application_fee/);
    const link = stripeCalls.find((c) => c[0] === "accountLinks.create")?.[1] as Record<string, string>;
    expect(link.account).toBe("acct_1NewOne");
    expect(link.return_url).toMatch(/\/provider\?card=back#card$/);
  });

  it("reuses an account already linked", async () => {
    rpcResults.stripe_account_of = { data: "acct_1Existing", error: null };
    await onboardingUrl(cfg, { providerId: "p1", email: null, slug: "ace" });
    expect(stripeCalls.map((c) => c[0])).toEqual(["accountLinks.create"]);
  });
});

describe("cardCheckoutUrl", () => {
  it("makes a one-off card payment on the trader's account, with no fee for us", async () => {
    expect(await cardCheckoutUrl(cfg, pay)).toBe("https://checkout.stripe.test/pay");
    const [, params, opts] = stripeCalls[0] as [string, Record<string, unknown>, Record<string, unknown>];
    expect(opts).toEqual({ stripeAccount: "acct_1Trader" });
    expect(params.mode).toBe("payment");
    expect(params.metadata).toEqual({ doc_id: "doc-1", what: "invoice" });
    expect(JSON.stringify(params)).toContain('"unit_amount":8000');
    expect(JSON.stringify(params)).not.toMatch(/application_fee/);
    expect(params.success_url).toBe(`https://www.boltonvouched.co.uk/d/${pay.token}?card={CHECKOUT_SESSION_ID}`);
  });
});

describe("recording a payment", () => {
  it("records only a paid session with a doc and an amount", async () => {
    rpcResults.record_card_payment = { data: { result: "recorded", ask_review: true }, error: null };
    const paid = { id: "cs_test_1", payment_status: "paid", amount_total: 8000, metadata: { doc_id: "doc-1" } };
    expect(await recordPaidSession(paid as never, "acct_1Trader")).toEqual({ result: "recorded", ask_review: true });
    expect(rpcs.at(-1)).toEqual(["record_card_payment", { p_session: "cs_test_1", p_doc: "doc-1", p_account: "acct_1Trader", p_amount: 8000 }]);
    expect(await recordPaidSession({ ...paid, payment_status: "unpaid" } as never, "acct_1Trader")).toBeNull();
    expect(await recordPaidSession({ ...paid, metadata: {} } as never, "acct_1Trader")).toBeNull();
  });

  it("checks the customer's return against the trader's account", async () => {
    rpcResults.doc_card_payment = { data: pay, error: null };
    rpcResults.record_card_payment = { data: { result: "recorded", ask_review: false }, error: null };
    expect(await confirmReturn(cfg, pay.token, "cs_test_abc123")).toEqual({ result: "recorded", ask_review: false });
    expect(stripeCalls[0]).toEqual(["sessions.retrieve", "cs_test_abc123", { stripeAccount: "acct_1Trader" }]);
    expect(await confirmReturn(cfg, pay.token, "not-a-session")).toBeNull();
  });
});
