import { describe, expect, it } from "vitest";
import { payLink } from "@/lib/pay-link";

describe("payLink", () => {
  it("accepts the payment providers' links, naming the provider", () => {
    expect(payLink("https://pay.sumup.com/b2c/QABC123")).toEqual({ url: "https://pay.sumup.com/b2c/QABC123", name: "SumUp" });
    expect(payLink("paypal.me/AcePlumbing")).toEqual({ url: "https://paypal.me/AcePlumbing", name: "PayPal" });
    expect(payLink(" https://www.paypal.com/paypalme/ace ")?.name).toBe("PayPal");
    expect(payLink("https://square.link/u/AbC12")?.name).toBe("Square");
    expect(payLink("https://buy.stripe.com/test_9AQ")?.name).toBe("Stripe");
    expect(payLink("https://monzo.me/acejones")?.name).toBe("Monzo");
  });

  it("refuses anything else", () => {
    for (const bad of [
      "",
      "http://paypal.me/ace",
      "https://paypal.me.evil.example/ace",
      "https://evil.example/paypal.me/ace",
      "https://user:pw@paypal.me/ace",
      "https://paypal.me:8443/ace",
      "https://paypal.me/",
      "javascript:alert(1)",
      `https://paypal.me/${"a".repeat(300)}`,
    ]) {
      expect(payLink(bad), bad).toBeNull();
    }
  });
});
