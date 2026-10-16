import { BADGE_LABEL, type RatingBadge as Badge } from "@/lib/badges";

const Star = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z" />
  </svg>
);

/**
 * An earned badge (lib/badges.ts ratingBadge): "Top rated" in gold, "Highly rated" quieter. The words always show;
 * the star is decoration.
 */
export function RatingBadge({ badge }: { badge: Badge }) {
  return (
    <span className={`pill pill-${badge}`} data-testid="rating-badge">
      <Star />
      {BADGE_LABEL[badge]}
    </span>
  );
}
