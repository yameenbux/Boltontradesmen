import { z } from "zod";
import type { OnPrice, OnTime, UseAgain, ValueBand } from "@/lib/review-text";

// The review form's questions, answers and messages. Client-safe (no server imports): the form and its server
// actions share it. The database (submit_review / edit_review) applies the same rules again and is the authority.

export const COMMENT_MAX = 400;
export const REPLY_MAX = 400;

// Proof of the job (checked again on the server from the file's bytes: lib/proofs.ts).
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export const PROOF_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const PROOF_WRONG_TYPE = "Please upload a photo (JPEG, PNG or WebP) or a PDF.";
export const PROOF_TOO_BIG = "Files must be 10 MB or smaller.";
// Ten or more digits, however they are spaced or punctuated, is a phone number (same pattern as the database).
const PHONE_IN_TEXT = /([0-9][ ().-]*){10,}/;

export type ReviewStatus = "published" | "under_check";

export type ReviewErrorCode =
  | "own_listing"
  | "shares_category"
  | "new_account_limit"
  | "already_reviewed"
  | "removed_before"
  | "comment_has_phone"
  | "comment_too_long"
  | "edit_window_closed"
  | "blocked"
  | "bad_job_month"
  | "tidy_required";

export const REVIEW_ERRORS: Record<ReviewErrorCode, string> = {
  own_listing: "You can't review your own listing.",
  shares_category: "You can't review someone who works in the same trade as you.",
  new_account_limit: "New accounts can post one review in their first 24 hours. Come back tomorrow to add another.",
  already_reviewed: "You've already reviewed this provider. You can edit your review instead.",
  removed_before:
    "Your earlier review of this provider was removed, so you can't post another. Contact us if you think that's wrong.",
  comment_has_phone: "Please leave phone numbers out of your review.",
  comment_too_long: "Keep your comment to 400 characters.",
  edit_window_closed: "Reviews can only be edited for 14 days after posting.",
  blocked: "Your account can't post reviews. Contact us if you think that's wrong.",
  bad_job_month: "Pick the month the job was done, within the last three years.",
  tidy_required: "Tell us whether they left the place tidy.",
};
export const REVIEW_FALLBACK_ERROR = "Something went wrong. Your review is saved on this device; please try again.";

export function reviewErrorMessage(err: { message: string }): string {
  return (REVIEW_ERRORS as Record<string, string>)[err.message] ?? REVIEW_FALLBACK_ERROR;
}

/** Which form field a database error belongs next to (others are shown above the button). */
export const ERROR_FIELD: Partial<Record<ReviewErrorCode, string>> = {
  comment_has_phone: "comment",
  comment_too_long: "comment",
  bad_job_month: "job_month",
  tidy_required: "tidy",
};

export function statusLabel(status: ReviewStatus): "Published" | "Published, under a quick check" {
  return status === "under_check" ? "Published, under a quick check" : "Published";
}

// ---------------------------------------------------------------- the questions, in plain words
type Option<T extends string> = { value: T; label: string };

export const VALUE_BAND_OPTIONS: Option<ValueBand>[] = [
  { value: "<250", label: "Under £250" },
  { value: "250-1k", label: "£250 to £1,000" },
  { value: "1k-5k", label: "£1,000 to £5,000" },
  { value: "5k+", label: "Over £5,000" },
];
export const ON_TIME_OPTIONS: Option<OnTime>[] = [
  { value: "yes", label: "Yes" },
  { value: "late_informed", label: "Late, but they let me know" },
  { value: "no", label: "No" },
];
export const ON_PRICE_OPTIONS: Option<OnPrice>[] = [
  { value: "yes", label: "Yes" },
  { value: "slightly_over_explained", label: "A bit over, but explained" },
  { value: "significantly_over", label: "Well over" },
];
export const QUALITY_OPTIONS: Option<"1" | "2" | "3" | "4" | "5">[] = [
  { value: "1", label: "Poor" },
  { value: "2", label: "Fair" },
  { value: "3", label: "Good" },
  { value: "4", label: "Very good" },
  { value: "5", label: "Excellent" },
];
export const TIDY_OPTIONS: Option<"yes" | "no">[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
export const USE_AGAIN_OPTIONS: Option<UseAgain>[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

// ---------------------------------------------------------------- validation
const choose = (message: string) => ({ error: () => message });
// Database ids. Loose on purpose: fixture ids such as 00000000-…-e201 are not RFC version-4 UUIDs.
export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reviewInputSchema = z.object({
  category_id: z.string(choose("Choose what they did for you.")).regex(ID_PATTERN, "Choose what they did for you."),
  job_month: z
    .string(choose("Choose the month of the job."))
    .regex(/^\d{4}-\d{2}(-01)?$/, "Choose the month of the job.")
    .transform((v) => (v.length === 7 ? `${v}-01` : v)),
  value_band: z.enum(["<250", "250-1k", "1k-5k", "5k+"], choose("Choose how much it roughly cost.")),
  on_time: z.enum(["yes", "late_informed", "no"], choose("Tell us whether they turned up when they said.")),
  on_price: z.enum(
    ["yes", "slightly_over_explained", "significantly_over"],
    choose("Tell us whether they stuck to the price."),
  ),
  quality: z
    .string(choose("Give the quality of work a score from 1 to 5."))
    .regex(/^[1-5]$/, "Give the quality of work a score from 1 to 5.")
    .transform(Number),
  tidy: z
    .enum(["yes", "no", ""], choose(REVIEW_ERRORS.tidy_required))
    .optional()
    .transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
  use_again: z.enum(["yes", "maybe", "no"], choose("Tell us whether you'd use them again.")),
  comment: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= COMMENT_MAX, REVIEW_ERRORS.comment_too_long)
    .refine((v) => !PHONE_IN_TEXT.test(v), REVIEW_ERRORS.comment_has_phone)
    .transform((v) => v || null),
});
export type ReviewInput = z.output<typeof reviewInputSchema>;

/** The form's field names, in the order they appear (used for drafts and for focusing the first error). */
export const REVIEW_FIELDS = [
  "category_id",
  "job_month",
  "value_band",
  "on_time",
  "on_price",
  "quality",
  "tidy",
  "use_again",
  "comment",
] as const;

// ---------------------------------------------------------------- the month list
const londonMonth = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit" })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return { y: Number(parts.year), m: Number(parts.month) };
};

/** This London month and the 36 before it (the job month must be within three years), newest first. */
export function recentMonths(now: Date, count = 37): { value: string; label: string }[] {
  const { y, m } = londonMonth(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    return { value, label };
  });
}

/** Whether a 14-day edit window (its last moment as an ISO timestamp) is still open. */
export function stillOpen(until: string, now: Date = new Date()): boolean {
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now.getTime();
}
