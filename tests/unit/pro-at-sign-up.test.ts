import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Pro straight after the sign-up form (one Checkout helper for it and the dashboard), and the dashboard's offer that
// starts from the trader's own enquiries.
const create = vi.fn<(args: Record<string, unknown>) => Promise<{ url: string }>>(async () => ({
  url: "https://checkout.stripe.com/c/pay/test",
}));
vi.mock("@/lib/stripe", () => ({ stripeClient: () => ({ checkout: { sessions: { create } } }) }));
const rpc = vi.fn(async () => ({ data: null }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/app/(platform)/provider/pro-actions", () => ({ startProCheckout: vi.fn(), openBillingPortal: vi.fn() }));

import { proCheckoutUrl } from "@/lib/pro-checkout";
import { ProUpgradeCard } from "@/components/provider/ProOffer";

const cfg = { secretKey: "sk_test", webhookSecret: "whsec", prices: { monthly: "price_m", annual: "price_a" } };

describe("proCheckoutUrl", () => {
  it("opens Checkout for the listing and plan, coming back to the pages given", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.boltonvouched.co.uk");
    const url = await proCheckoutUrl(cfg as never, {
      providerId: "0b8e1f0a-1111-4222-8333-444455556666",
      email: "sam@example.com",
      plan: "annual",
      successPath: "/provider/live?pro=success",
      cancelPath: "/provider/live?pro=stopped",
    });
    expect(url).toBe("https://checkout.stripe.com/c/pay/test");
    const args = create.mock.calls[0][0];
    expect(args).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_a", quantity: 1 }],
      client_reference_id: "0b8e1f0a-1111-4222-8333-444455556666",
      customer_email: "sam@example.com",
      metadata: { provider_id: "0b8e1f0a-1111-4222-8333-444455556666" },
      success_url: "https://www.boltonvouched.co.uk/provider/live?pro=success",
      cancel_url: "https://www.boltonvouched.co.uk/provider/live?pro=stopped",
    });
    vi.unstubAllEnvs();
  });

  it("keeps a returning trader's Stripe customer", async () => {
    rpc.mockResolvedValueOnce({ data: "cus_123" } as never);
    await proCheckoutUrl(cfg as never, { providerId: "p", email: "x@example.com", plan: "monthly", successPath: "/a", cancelPath: "/b" });
    const args = create.mock.calls.at(-1)![0];
    expect(args.customer).toBe("cus_123");
    expect(args.customer_email).toBeUndefined();
    expect(args.line_items).toEqual([{ price: "price_m", quantity: 1 }]);
  });
});

describe("the dashboard's Pro offer", () => {
  const html = (props: { enquiries?: number; ended?: boolean }) =>
    renderToStaticMarkup(createElement(ProUpgradeCard, { providerId: "p", ...props }));
  it("starts from this month's enquiries once there are some", () => {
    expect(html({ enquiries: 6 })).toContain("had 6 enquiries this month.");
    expect(html({ enquiries: 1 })).toContain("had 1 enquiry this month.");
  });
  it("says nothing about enquiries when there are none, or when restarting", () => {
    expect(html({ enquiries: 0 })).not.toContain("this month.");
    expect(html({ enquiries: 4, ended: true })).not.toContain("this month.");
  });
});
