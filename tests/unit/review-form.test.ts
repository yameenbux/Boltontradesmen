import { describe, it, expect } from "vitest";
import { recentMonths, REVIEW_ERRORS, reviewErrorMessage, reviewInputSchema, statusLabel } from "@/lib/review-form";

const CAT = "11111111-1111-4111-8111-111111111111";
const base = {
  category_id: CAT,
  job_month: "2026-09",
  value_band: "250-1k",
  on_time: "yes",
  on_price: "slightly_over_explained",
  quality: "4",
  use_again: "yes",
  comment: "",
};

describe("statusLabel", () => {
  it("uses the exact result wording", () => {
    expect(statusLabel("published")).toBe("Published");
    expect(statusLabel("under_check")).toBe("Published, under a quick check");
    expect(statusLabel("pending")).toBe("Waiting for a quick check — it'll appear once approved");
  });
});

describe("reviewErrorMessage", () => {
  it("maps a known code to its copy (Review Focus 3)", () => {
    expect(reviewErrorMessage({ message: "already_reviewed" })).toBe(
      "You've already reviewed this provider. You can edit your review instead.",
    );
    expect(REVIEW_ERRORS.comment_has_phone).toBe("Please leave phone numbers out of your review.");
  });

  it("falls back to the saved-on-this-device copy for anything else", () => {
    expect(reviewErrorMessage({ message: "duplicate key value violates something" })).toBe(
      "Something went wrong. Your review is saved on this device; please try again.",
    );
  });
});

describe("reviewInputSchema", () => {
  it("turns the month picker value into the first of the month and the answers into DB values", () => {
    const r = reviewInputSchema.safeParse({ ...base, tidy: "yes", comment: "  Great job  " });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      category_id: CAT,
      job_month: "2026-09-01",
      value_band: "250-1k",
      on_time: "yes",
      on_price: "slightly_over_explained",
      quality: 4,
      tidy: true,
      use_again: "yes",
      comment: "Great job",
    });
  });

  it("accepts tidy absent for a category that doesn't ask it, and a blank comment as none", () => {
    const r = reviewInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.tidy).toBeNull();
    expect(r.data?.comment).toBeNull();
  });

  it("rejects a 401-character comment", () => {
    const r = reviewInputSchema.safeParse({ ...base, comment: "a".repeat(401) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["comment"], message: REVIEW_ERRORS.comment_too_long });
  });

  it("rejects a comment with a phone number in it, however it is spaced", () => {
    const r = reviewInputSchema.safeParse({ ...base, comment: "ring him on 07700 900 123" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["comment"], message: REVIEW_ERRORS.comment_has_phone });
    expect(reviewInputSchema.safeParse({ ...base, comment: "Fitted 2 radiators for £350 in 2026" }).success).toBe(true);
  });

  it("names each missing answer", () => {
    const r = reviewInputSchema.safeParse({ category_id: "", job_month: "", comment: "" });
    expect(r.success).toBe(false);
    const fields = new Set(r.error?.issues.map((i) => i.path[0]));
    for (const f of ["category_id", "job_month", "value_band", "on_time", "on_price", "quality", "use_again"]) {
      expect(fields.has(f)).toBe(true);
    }
  });

  it("refuses a quality outside 1 to 5", () => {
    expect(reviewInputSchema.safeParse({ ...base, quality: "6" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...base, quality: "0" }).success).toBe(false);
  });
});

describe("recentMonths", () => {
  it("lists this London month first and goes back 36 months", () => {
    const months = recentMonths(new Date("2026-10-12T10:00:00Z"));
    expect(months).toHaveLength(37);
    expect(months[0]).toEqual({ value: "2026-10", label: "October 2026" });
    expect(months[1]).toEqual({ value: "2026-09", label: "September 2026" });
    expect(months[36]).toEqual({ value: "2023-10", label: "October 2023" });
  });

  it("uses the London month at midnight on the 1st", () => {
    // 23:30 UTC on 31 October is still 31 October in London (GMT from 25 October).
    expect(recentMonths(new Date("2026-10-31T23:30:00Z"))[0].value).toBe("2026-10");
    // 23:30 UTC on 31 May is 00:30 on 1 June in London (BST).
    expect(recentMonths(new Date("2026-05-31T23:30:00Z"))[0].value).toBe("2026-06");
  });
});
