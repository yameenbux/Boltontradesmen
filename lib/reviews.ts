import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import type { PublicReview } from "@/lib/review-text";

export type { PublicReview } from "@/lib/review-text";

// Public reviews, read through the review_public view with the cookie-free client (profiles stay ISR).

/* eslint-disable @typescript-eslint/no-explicit-any */
function toReview(r: any): PublicReview {
  return {
    id: r.id,
    providerId: r.provider_id,
    categoryName: r.category_name,
    jobMonth: r.job_month,
    valueBand: r.value_band,
    onTime: r.on_time,
    onPrice: r.on_price,
    quality: r.quality,
    tidy: r.tidy ?? null,
    useAgain: r.use_again,
    comment: r.comment ?? null,
    underCheck: !!r.under_check,
    reviewerName: r.reviewer_name,
    verifiedJob: !!r.verified_job,
    replyBody: r.reply_body ?? null,
    replyAt: r.reply_at ?? null,
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
  };
}

export async function listProviderReviews(providerId: string): Promise<PublicReview[]> {
  const { data, error } = await createPublicClient()
    .from("review_public")
    .select("*")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listProviderReviews: ${error.message}`);
  return (data ?? []).map(toReview);
}

/** One public review by id (for the Report page), with its provider's slug; null when it isn't public. */
export async function getPublicReview(id: string): Promise<{ review: PublicReview; providerSlug: string } | null> {
  const { data, error } = await createPublicClient().from("review_public").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getPublicReview: ${error.message}`);
  return data ? { review: toReview(data), providerSlug: data.provider_slug } : null;
}
