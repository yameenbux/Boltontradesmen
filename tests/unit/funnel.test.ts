import { describe, expect, it } from "vitest";
import { toFunnel } from "@/lib/funnel";

describe("toFunnel", () => {
  it("reads every step, with missing or odd values as 0", () => {
    expect(toFunnel({
      days: 7,
      steps: { "for-traders": 12, "trader-sign-in": "5", "trader-form": -1 },
      arrivals: { fb: 9, wa: "2", tiktok: 4 },
      listed: 2,
      listed_from: { facebook: 1, unknown: 1, myspace: 3 },
    })).toEqual({
      days: 7,
      steps: { "for-traders": 12, "get-listed": 0, "trader-sign-in": 5, "trader-form": 0 },
      arrivals: { fb: 9, ig: 0, wa: 2 },
      listed: 2,
      listedFrom: { facebook: 1, whatsapp: 0, word_of_mouth: 0, instagram: 0, google: 0, other: 0, unknown: 1 },
    });
    expect(toFunnel(null).listed).toBe(0);
  });
});
