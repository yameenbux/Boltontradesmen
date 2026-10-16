// Public review types and their plain-English wording. No server imports: used by client components too.

export type OnTime = "yes" | "late_informed" | "no";
export type OnPrice = "yes" | "slightly_over_explained" | "significantly_over";
export type UseAgain = "yes" | "maybe" | "no";
export type ValueBand = "<250" | "250-1k" | "1k-5k" | "5k+";

export type PublicReview = {
  id: string;
  providerId: string;
  categoryName: string;
  jobMonth: string;
  valueBand: ValueBand;
  onTime: OnTime;
  onPrice: OnPrice;
  quality: number;
  tidy: boolean | null;
  useAgain: UseAgain;
  comment: string | null;
  underCheck: boolean;
  reviewerName: string;
  verifiedJob: boolean;
  replyBody: string | null;
  replyAt: string | null;
  createdAt: string;
  editedAt: string | null;
};

// Plain-English answers, as residents would say them.
export const ON_TIME_TEXT: Record<OnTime, string> = {
  yes: "On time",
  late_informed: "Late, but kept me posted",
  no: "Late",
};
export const ON_PRICE_TEXT: Record<OnPrice, string> = {
  yes: "Stuck to the price",
  slightly_over_explained: "A bit over the price, explained",
  significantly_over: "Well over the price",
};
export const USE_AGAIN_TEXT: Record<UseAgain, string> = {
  yes: "Would use again",
  maybe: "Might use again",
  no: "Wouldn't use again",
};
export const VALUE_BAND_TEXT: Record<ValueBand, string> = {
  "<250": "Under £250",
  "250-1k": "£250 to £1,000",
  "1k-5k": "£1,000 to £5,000",
  "5k+": "Over £5,000",
};

// "2026-10-01" → "October 2026" (UK, Europe/London).
export function monthYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}
