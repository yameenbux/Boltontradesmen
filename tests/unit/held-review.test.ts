import { describe, it, expect } from "vitest";
import { myReviewStatus } from "@/lib/account-text";
import { HELD_REVIEW_LABEL, statusLabel } from "@/lib/review-form";

// Plan 2b Task 8: reviews by email-only accounts wait for the admin. The reviewer sees the same words on the
// result screen and in "My reviews".
describe("held reviews", () => {
  it("uses the exact reviewer-facing copy (em dash)", () => {
    expect(HELD_REVIEW_LABEL).toBe("Waiting for a quick check — it'll appear once approved");
    expect(statusLabel("pending")).toBe(HELD_REVIEW_LABEL);
  });

  it("shows the same label in My reviews", () => {
    expect(myReviewStatus({ status: "pending", removal_reason: null })).toBe(HELD_REVIEW_LABEL);
    expect(myReviewStatus({ status: "published", removal_reason: null })).toBe("Published");
    expect(myReviewStatus({ status: "removed", removal_reason: "Spam" })).toBe("Removed: Spam");
  });
});
