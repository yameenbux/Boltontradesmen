"use client";

import { useState } from "react";
import { ReviewItem } from "@/components/profile/ReviewItem";
import { Button } from "@/components/ui/Button";
import type { PublicReview } from "@/lib/review-text";
import { platformPath } from "@/lib/paths";

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

/**
 * The profile's Reviews section. "Verified job" is an optional filter, done in the browser like the area chips,
 * so the profile stays a static, cacheable page.
 */
export function ReviewList({
  reviews: all,
  slug,
  businessName,
}: {
  reviews: PublicReview[];
  slug: string;
  businessName: string;
}) {
  const [verified, setVerified] = useState(false);
  const shown = all.filter((r) => !verified || r.verifiedJob);
  const leave = (
    <Button href={platformPath("p", slug, "review")} variant="secondary" className="leave">
      Leave a review
    </Button>
  );

  return (
    <section className="card reviews" aria-labelledby="reviews-title">
      <div className="reviews-head">
        <h2 id="reviews-title">Reviews {all.length > 0 && <em>{all.length}</em>}</h2>
      </div>
      {all.length === 0 ? (
        <>
          <p className="reviews-empty">No reviews yet. Used them? Be the first to leave one.</p>
          {leave}
        </>
      ) : (
        <>
          {leave}
          <div className="review-filters" role="group" aria-label="Show only">
            <button type="button" className="chip press" aria-pressed={verified} onClick={() => setVerified((v) => !v)}>
              Verified job <em>{all.filter((r) => r.verifiedJob).length}</em>
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            Showing {reviews(shown.length)}
          </p>
          {shown.length === 0 ? (
            <p className="empty">No reviews match. Try turning the filter off.</p>
          ) : (
            <div className="review-list" key={String(verified)}>
              {shown.map((r) => (
                <ReviewItem key={r.id} review={r} businessName={businessName} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
