import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Without Stripe's settings nothing is attempted: no sign-in lookup, no database call, no Stripe call.
const requireMember = vi.fn(async () => {
  throw new Error("requireMember should not be called");
});
vi.mock("@/lib/auth", () => ({ requireMember: () => requireMember() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));

import { openBillingPortal, startProCheckout } from "@/app/(platform)/provider/pro-actions";

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

beforeEach(() => {
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_ANNUAL"]) vi.stubEnv(k, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Pro without Stripe set up", () => {
  it("checkout says Pro opens soon and does nothing else", async () => {
    const out = await startProCheckout({}, fd({ provider_id: "0b8e1f0a-1111-4222-8333-444455556666", plan: "monthly" }));
    expect(out).toEqual({ message: "Pro opens soon. Nothing has been charged." });
    expect(requireMember).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("with only some of the settings, still nothing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const out = await startProCheckout({}, fd({ provider_id: "0b8e1f0a-1111-4222-8333-444455556666", plan: "annual" }));
    expect(out.message).toMatch(/opens soon/);
    expect(requireMember).not.toHaveBeenCalled();
  });

  it("Manage billing can't open either", async () => {
    const out = await openBillingPortal({}, fd({ provider_id: "0b8e1f0a-1111-4222-8333-444455556666" }));
    expect(out.message).toMatch(/can't be opened/);
    expect(requireMember).not.toHaveBeenCalled();
  });
});
