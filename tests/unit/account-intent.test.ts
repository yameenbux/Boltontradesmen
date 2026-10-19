import { describe, expect, it } from "vitest";
import { asksIntent, TRADER_SIGN_IN, TRADER_START } from "@/lib/account-intent";

describe("account intent", () => {
  it("offers the customer-or-trader switch only when the sign-in had no particular destination", () => {
    expect(asksIntent("/platform")).toBe(true);
    expect(asksIntent("/platform/account")).toBe(true);
    expect(asksIntent("/platform/p/some-plumber/review")).toBe(false);
    expect(asksIntent("/platform/link/abc")).toBe(false);
    expect(asksIntent(TRADER_START)).toBe(false);
  });

  it("the trader sign-in lands on the trader start", () => {
    expect(TRADER_SIGN_IN).toBe("/platform/sign-in?next=%2Fplatform%2Fprovider");
  });
});
