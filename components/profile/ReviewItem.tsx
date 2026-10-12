import { Pill } from "@/components/ui/Pill";
import {
  monthYear,
  ON_PRICE_TEXT,
  ON_TIME_TEXT,
  USE_AGAIN_TEXT,
  VALUE_BAND_TEXT,
  type PublicReview,
} from "@/lib/review-text";
import { platformPath } from "@/lib/paths";

const Tick = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Star = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" opacity={dim ? 0.3 : undefined} aria-hidden="true">
    <path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z" />
  </svg>
);

/** One review: who and when, badges, quality stars, the answers as tags, the comment, the provider's reply, Report. */
export function ReviewItem({ review: r, businessName }: { review: PublicReview; businessName: string }) {
  const answers = [
    USE_AGAIN_TEXT[r.useAgain],
    ON_TIME_TEXT[r.onTime],
    ON_PRICE_TEXT[r.onPrice],
    r.tidy === null ? null : r.tidy ? "Left it tidy" : "Didn't leave it tidy",
    VALUE_BAND_TEXT[r.valueBand],
  ].filter((a): a is string => a !== null);

  return (
    <article className="review" aria-label={`Review by ${r.reviewerName}`}>
      <div className="rh">
        <b>{r.reviewerName}</b>
        <span>{monthYear(r.jobMonth)}</span>
      </div>
      {(r.verifiedJob || r.groupMember) && (
        <div className="badges">
          {r.verifiedJob && (
            <Pill tone="sage">
              <Tick />
              Verified job
            </Pill>
          )}
          {r.groupMember && <Pill tone="outline">Group member</Pill>}
        </div>
      )}
      <div className="rq">
        <span className="stars" role="img" aria-label={`Quality ${r.quality} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} dim={n > r.quality} />
          ))}
        </span>
        <span>{r.categoryName}</span>
      </div>
      <ul className="tags" aria-label="Their answers">
        {answers.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {r.comment && <p className="comment">{r.comment}</p>}
      {r.underCheck && (
        <p className="under-check">
          <Pill tone="gold">Under check</Pill>
          <span>This review is being checked. It still counts while we look.</span>
        </p>
      )}
      {r.replyBody && (
        <div className="reply">
          <b>Reply from {businessName}</b>
          <p>{r.replyBody}</p>
        </div>
      )}
      <div className="rf">
        <a href={platformPath("report", r.id)} rel="nofollow" className="report">
          Report
        </a>
      </div>
    </article>
  );
}
