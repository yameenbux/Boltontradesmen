// Earned rating badges. Positive only: there is no warning badge. Worked out here from the figures a listing already
// shows (provider_public: review_count, score, use_again_pct), so a badge can never disagree with the numbers next to
// it. Badges never change the order of a list (lib/directory.ts sorts on the score alone) and never go into
// structured data. The rules are written out on /how-ratings-work; keep the two in step.

/** Reviews that count towards the score (published or under check) needed before any badge. */
export const BADGE_MIN_REVIEWS = 5;
/** "Top rated": quality score (as shown, to 1 decimal place) and "would use again" percentage. */
export const TOP_RATED_MIN_SCORE = 4.5;
export const TOP_RATED_MIN_USE_AGAIN = 90;
/** "Highly rated": the same two figures, a step lower. */
export const HIGHLY_RATED_MIN_SCORE = 4.0;
export const HIGHLY_RATED_MIN_USE_AGAIN = 80;

export type RatingBadge = "top" | "high";

export const BADGE_LABEL: Record<RatingBadge, string> = { top: "Top rated", high: "Highly rated" };

type BadgeStats = { reviewCount: number; score: number | null; useAgainPct: number | null };

/** The quality score as a listing shows it ("4.5"): the shrunk score to 1 decimal place. */
export function shownQuality(score: number): string {
  return score.toFixed(1);
}

/**
 * The one badge a provider has earned, the highest that applies, or null. Uses the score as shown, so a profile that
 * says "4.5" is held to the 4.5 rule rather than to a hidden 4.47.
 */
export function ratingBadge(stats: BadgeStats): RatingBadge | null {
  const { reviewCount, score, useAgainPct } = stats;
  if (!Number.isFinite(reviewCount) || reviewCount < BADGE_MIN_REVIEWS) return null;
  if (score === null || useAgainPct === null || !Number.isFinite(score) || !Number.isFinite(useAgainPct)) return null;
  const quality = Number(shownQuality(score));
  if (quality >= TOP_RATED_MIN_SCORE && useAgainPct >= TOP_RATED_MIN_USE_AGAIN) return "top";
  if (quality >= HIGHLY_RATED_MIN_SCORE && useAgainPct >= HIGHLY_RATED_MIN_USE_AGAIN) return "high";
  return null;
}
