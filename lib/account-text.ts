import { statusLabel } from "@/lib/review-form";

// Client-safe wording and shapes for the account page ("My reviews" and Delete account).

export const DELETE_RETRY_MESSAGE =
  "Your reviews are down, but we couldn't finish deleting your account. Please try again.";
export const DELETE_FAILED_MESSAGE = "Something went wrong. Nothing was deleted. Please try again.";
export const DELETE_CONFIRM_ERROR = "Tick the box to confirm.";

export type ProofState = "pending" | "accepted" | "rejected";
export type MyReviewRow = {
  id: string;
  provider_slug: string;
  business_name: string;
  status: "published" | "under_check" | "under_notice" | "removed";
  removal_reason: string | null;
  created_at: string;
  editable_until: string;
  proof: ProofState | null;
};

export const PROOF_TEXT: Record<ProofState, string> = {
  pending: "Proof sent for checking",
  accepted: "Verified job",
  rejected: "Proof not accepted",
};

/** The status line under one of "My reviews". */
export function myReviewStatus(r: Pick<MyReviewRow, "status" | "removal_reason">): string {
  if (r.status === "removed") return `Removed: ${r.removal_reason ?? "no reason given"}`;
  if (r.status === "under_notice") return "Hidden while we look into a complaint";
  return statusLabel(r.status);
}
