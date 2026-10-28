import { describe, expect, it } from "vitest";
import { toFunnel } from "@/lib/funnel";

describe("toFunnel", () => {
  it("reads every step, with missing or odd values as 0", () => {
    expect(toFunnel({ days: 7, steps: { "for-traders": 12, "trader-sign-in": "5", "trader-form": -1 }, listed: 2 })).toEqual({
      days: 7,
      steps: { "for-traders": 12, "get-listed": 0, "trader-sign-in": 5, "trader-form": 0 },
      listed: 2,
    });
    expect(toFunnel(null).listed).toBe(0);
  });
});
