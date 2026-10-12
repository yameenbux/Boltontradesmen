import { Pill } from "@/components/ui/Pill";
import { TickIcon } from "@/components/auth/icons";
import { myReviewStatus, PROOF_TEXT, type MyReviewRow } from "@/lib/account-text";
import { dayMonthYear } from "@/lib/checks";
import { platformPath } from "@/lib/paths";
import { stillOpen } from "@/lib/review-form";

/** "My reviews" on the account page: where each review stands, its proof, and Edit while the 14 days last. */
export function MyReviews({ reviews }: { reviews: MyReviewRow[] }) {
  return (
    <section className="auth-card" aria-labelledby="my-reviews-title">
      <h2 id="my-reviews-title">
        My reviews {reviews.length > 0 && <em className="count">{reviews.length}</em>}
      </h2>
      {reviews.length === 0 ? (
        <p className="lede">
          You haven&apos;t left a review yet. Used someone local? Find them in the{" "}
          <a href={platformPath()}>directory</a> and tell the next person how it went.
        </p>
      ) : (
        <ul className="my-reviews">
          {reviews.map((r) => {
            const removed = r.status === "removed";
            const editable = !removed && stillOpen(r.editable_until);
            return (
              <li key={r.id} className={removed ? "is-removed" : undefined}>
                <div className="mr-head">
                  {removed ? (
                    <b>{r.business_name}</b>
                  ) : (
                    <a href={platformPath("p", r.provider_slug)}>
                      <b>{r.business_name}</b>
                    </a>
                  )}
                  <small>Posted {dayMonthYear(r.created_at)}</small>
                </div>
                <p className="mr-status">
                  {removed ? (
                    <span>{myReviewStatus(r)}</span>
                  ) : (
                    <Pill tone={r.status === "published" ? "sage" : "gold"}>
                      {r.status === "published" && <TickIcon />}
                      {myReviewStatus(r)}
                    </Pill>
                  )}
                  {r.proof && !removed && (
                    <Pill tone={r.proof === "accepted" ? "outline" : "muted"}>
                      {r.proof === "accepted" && <TickIcon />}
                      {PROOF_TEXT[r.proof]}
                    </Pill>
                  )}
                </p>
                {editable && (
                  <a className="mr-edit" href={platformPath("p", r.provider_slug, "review")}>
                    Edit<span className="sr-only"> your review of {r.business_name}</span>
                    <small aria-hidden="true">until {dayMonthYear(r.editable_until)}</small>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
