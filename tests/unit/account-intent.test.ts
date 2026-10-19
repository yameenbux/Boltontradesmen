import { describe, expect, it } from "vitest";
import { afterWelcome, asksIntent, isIntent, TRADER_SIGN_IN, TRADER_START } from "@/lib/account-intent";

describe("account intent", () => {
  it("asks only when the sign-in had no particular destination", () => {
    expect(asksIntent("/platform")).toBe(true);
    expect(asksIntent("/platform/account")).toBe(true);
    expect(asksIntent("/platform/p/some-plumber/review")).toBe(false);
    expect(asksIntent("/platform/link/abc")).toBe(false);
    expect(asksIntent(TRADER_START)).toBe(false);
  });

  it("sends a trader to the trader start, everyone else where they were going", () => {
    expect(afterWelcome("/platform", "trader")).toBe("/platform/provider");
    expect(afterWelcome("/platform/account", "trader")).toBe("/platform/provider");
    expect(afterWelcome("/platform", "customer")).toBe("/platform");
    expect(afterWelcome("/platform", null)).toBe("/platform");
    // A set destination wins (a review, a trader link).
    expect(afterWelcome("/platform/p/some-plumber/review", "trader")).toBe("/platform/p/some-plumber/review");
  });

  it("knows the two answers", () => {
    expect(isIntent("trader")).toBe(true);
    expect(isIntent("customer")).toBe(true);
    expect(isIntent("admin")).toBe(false);
    expect(isIntent("")).toBe(false);
  });

  it("the trader sign-in lands on the trader start", () => {
    expect(TRADER_SIGN_IN).toBe("/platform/sign-in?next=%2Fplatform%2Fprovider");
  });
});
