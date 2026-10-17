import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Withdrawing or removing a listing sets its running Pro subscriptions to cancel at the period end, best effort.
const update = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripeClient: () => ({ subscriptions: { update: (...a: unknown[]) => update(...a) } }) }));
const serviceRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: (...a: unknown[]) => serviceRpc(...a) }) }));
const userRpc = vi.fn();
const auth = { getUser: vi.fn(async () => ({ data: { user: { id: "u1", email: "admin@example.test" } } })) };
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc: (...a: unknown[]) => userRpc(...a) }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setStatus } from "@/app/admin/(protected)/providers/actions";
import { withdrawMyListing } from "@/app/platform/provider/actions";
import { cancelProForListing } from "@/lib/pro-cancel";

const PID = "11111111-1111-4111-8111-111111111111";
const STRIPE = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_ANNUAL: "price_y",
};
const ACCOUNT = {
  user_id: "u1", display_name: "Alan A.", postcode_district: "BL1", role: "provider", deleted: false,
  created_at: "2026-10-12T09:00:00Z", providers: [],
};
const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  update.mockReset().mockResolvedValue({});
  serviceRpc.mockReset().mockResolvedValue({ data: ["sub_a", "sub_b"], error: null });
  userRpc.mockReset().mockImplementation(async (name: string) =>
    name === "my_account" ? { data: ACCOUNT, error: null } : name === "is_admin" ? { data: true, error: null } : { data: "ace", error: null },
  );
  for (const [k, v] of Object.entries(STRIPE)) vi.stubEnv(k, v);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("cancelProForListing", () => {
  it("sets each running subscription to cancel at the period end", async () => {
    expect(await cancelProForListing(PID)).toBe(2);
    expect(serviceRpc).toHaveBeenCalledWith("stripe_live_subscriptions", { p_provider: PID });
    expect(update.mock.calls).toEqual([
      ["sub_a", { cancel_at_period_end: true }],
      ["sub_b", { cancel_at_period_end: true }],
    ]);
  });

  it("does nothing without Stripe set up", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await cancelProForListing(PID)).toBe(0);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("carries on past a Stripe error, and never throws", async () => {
    update.mockRejectedValueOnce(new Error("stripe down"));
    expect(await cancelProForListing(PID)).toBe(1);
    serviceRpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    expect(await cancelProForListing(PID)).toBe(0);
  });
});

describe("withdrawing and removing a listing", () => {
  it("the trader's withdrawal cancels Pro at the period end, then goes to the withdrawn page", async () => {
    await expect(withdrawMyListing({}, form({ provider_id: PID, confirm: "on" }))).rejects.toThrow(
      "REDIRECT /platform/provider?withdrawn=1",
    );
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("a Stripe failure never blocks the withdrawal", async () => {
    update.mockRejectedValue(new Error("stripe down"));
    await expect(withdrawMyListing({}, form({ provider_id: PID, confirm: "on" }))).rejects.toThrow("REDIRECT");
    expect(userRpc).toHaveBeenCalledWith("withdraw_my_listing", { p_provider: PID });
  });

  it("the admin's removal cancels Pro too; other status changes don't", async () => {
    const removed = await setStatus({}, form({ provider_id: PID, status: "removed", reason: "Asked to leave" }));
    expect(removed).toEqual({ ok: true, message: "Status updated. Their Pro is set to cancel at the end of the period paid for." });
    expect(update).toHaveBeenCalledTimes(2);
    update.mockClear();
    const paused = await setStatus({}, form({ provider_id: PID, status: "paused", reason: "" }));
    expect(paused.ok).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});
