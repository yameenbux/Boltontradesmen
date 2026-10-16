import type { Metadata } from "next";
import { ShopIcon } from "@/components/auth/icons";
import { AvailabilityForm } from "@/components/provider/AvailabilityForm";
import { ReplyForm } from "@/components/provider/ReplyForm";
import { ShareReviewLink } from "@/components/review-card/ShareReviewLink";
import { WebsiteBadge } from "@/components/share/WebsiteBadge";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { setMyAvailability } from "@/app/platform/provider/actions";
import { requireMember } from "@/lib/auth";
import { availabilityNow, bookedRange, type StoredAvailability } from "@/lib/availability";
import { dayMonthYear } from "@/lib/checks";
import { platformPath } from "@/lib/paths";
import { stillOpen } from "@/lib/review-form";
import { reviewShare } from "@/lib/review-link";
import { badgeShare, pageShare } from "@/lib/share";
import {
  monthYear,
  ON_PRICE_TEXT,
  ON_TIME_TEXT,
  USE_AGAIN_TEXT,
  VALUE_BAND_TEXT,
  type OnPrice,
  type OnTime,
  type UseAgain,
  type ValueBand,
} from "@/lib/review-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your listing | Bolton Vouched",
  description: "Your Bolton Vouched listing: see your reviews and reply to them.",
  robots: { index: false },
};

type Reply = { id: string; body: string; status: "published" | "removed"; created_at: string; editable_until: string };
type Review = {
  id: string;
  status: "published" | "under_check";
  created_at: string;
  job_month: string;
  reviewer_name: string;
  category_name: string;
  quality: number;
  use_again: UseAgain;
  on_time: OnTime;
  on_price: OnPrice;
  tidy: boolean | null;
  value_band: ValueBand;
  comment: string | null;
  reply: Reply | null;
};
type Listing = {
  provider: { id: string; slug: string; business_name: string; status: string; availability?: StoredAvailability };
  reviews: Review[];
};

const Star = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" opacity={dim ? 0.3 : undefined} aria-hidden="true">
    <path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z" />
  </svg>
);

function ProviderReview({ r }: { r: Review }) {
  const answers = [
    USE_AGAIN_TEXT[r.use_again],
    ON_TIME_TEXT[r.on_time],
    ON_PRICE_TEXT[r.on_price],
    r.tidy === null ? null : r.tidy ? "Left it tidy" : "Didn't leave it tidy",
    VALUE_BAND_TEXT[r.value_band],
  ].filter((a): a is string => a !== null);
  return (
    <article className="review" aria-label={`Review by ${r.reviewer_name}`}>
      <div className="rh">
        <b>{r.reviewer_name}</b>
        <span>{monthYear(r.job_month)}</span>
      </div>
      <div className="rq">
        <span className="stars" role="img" aria-label={`Quality ${r.quality} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} dim={n > r.quality} />
          ))}
        </span>
        <span>{r.category_name}</span>
      </div>
      <ul className="tags" aria-label="Their answers">
        {answers.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {r.comment && <p className="comment">{r.comment}</p>}
      {r.status === "under_check" && (
        <p className="under-check">
          <Pill tone="gold">Under check</Pill>
          <span>This review is being checked. It still counts while we look.</span>
        </p>
      )}
      <ReplyForm
        reviewId={r.id}
        reviewerName={r.reviewer_name}
        reply={
          r.reply
            ? {
                body: r.reply.body,
                removed: r.reply.status === "removed",
                editable: r.reply.status === "published" && stillOpen(r.reply.editable_until),
                editableUntil: dayMonthYear(r.reply.editable_until) ?? "",
              }
            : null
        }
      />
      <div className="rf">
        <a href={platformPath("report", r.id)} rel="nofollow" className="report">
          Report
        </a>
      </div>
    </article>
  );
}

export default async function ProviderArea() {
  const { supabase } = await requireMember(platformPath("provider"));
  const { data, error } = await supabase.rpc("provider_my_reviews");
  if (error) throw new Error(`provider_my_reviews failed: ${error.message}`);
  const listings = (data ?? []) as Listing[];

  if (listings.length === 0) {
    return (
      <main className="auth">
        <section className="auth-card" aria-labelledby="provider-title">
          <div>
            <p className="eyebrow">Your listing</p>
            <h1 id="provider-title">No listing found</h1>
            <p className="lede">
              We couldn&apos;t find a listing linked to your account. If you&apos;re listed, ask us for your trader
              sign-in link.
            </p>
          </div>
          <Button href={platformPath("account")} variant="secondary">
            Back to your account
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth">
      {listings.map(({ provider: p, reviews }) => (
        <div key={p.id} className="provider-area">
          <section className="auth-card" aria-labelledby={`listing-${p.id}`}>
            <div className="who-card">
              <span className="avatar listing-icon" aria-hidden="true">
                <ShopIcon />
              </span>
              <div>
                <p className="eyebrow">Your listing</p>
                <h1 id={`listing-${p.id}`} className="name">
                  {p.business_name}
                </h1>
              </div>
            </div>
            <p className="lede">
              Reply to any review. Your reply shows under it on your page straight away, and you can edit it for 14
              days.
            </p>
            {p.status !== "live" && (
              <p className="form-alert">
                Your listing isn&apos;t live right now, so reviews aren&apos;t showing to the public.
              </p>
            )}
            <Button href={platformPath("p", p.slug)} variant="secondary">
              See your public page
            </Button>
          </section>
          {(p.status === "live" || p.status === "paused") && (
            <section className="auth-card" aria-labelledby={`avail-${p.id}`}>
              <div>
                <h2 id={`avail-${p.id}`}>Taking on work?</h2>
                <p className="lede">
                  Let customers know if you&apos;ve room for new jobs, or when you&apos;re free again.
                  {listings.length > 1 && " It's the same on all your listings."}
                </p>
              </div>
              <AvailabilityForm action={setMyAvailability} now={availabilityNow(p.availability)} range={bookedRange()} />
            </section>
          )}
          <section className="auth-card" aria-labelledby={`ask-${p.id}`}>
            <div>
              <h2 id={`ask-${p.id}`}>Ask for reviews</h2>
              <p className="lede">
                Send your review link after each job, or hand over a printed card. Ask every customer, not just the
                happy ones — that&apos;s the rule, and it&apos;s what makes your reviews count.
              </p>
            </div>
            <ShareReviewLink {...reviewShare(p.slug, p.business_name)} cardHref={platformPath("provider", "card")} />
          </section>
          <section className="auth-card" aria-labelledby={`badge-${p.id}`}>
            <div>
              <h2 id={`badge-${p.id}`}>Your website badge</h2>
              <p className="lede">
                Put it on your website or Facebook page, or print it for your van. It links to your page here and
                shows your rating badge once you&apos;ve earned one.
              </p>
            </div>
            {p.status === "live" ? (
              <WebsiteBadge {...badgeShare(p.slug, p.business_name)} />
            ) : (
              <p className="form-alert">Your badge is ready once your listing is live.</p>
            )}
          </section>
          <section className="auth-card" aria-labelledby={`page-${p.id}`}>
            <div>
              <h2 id={`page-${p.id}`}>Share your page</h2>
              <p className="lede">Send your page to anyone who asks for a recommendation.</p>
            </div>
            <ShareReviewLink {...pageShare(p.slug, p.business_name)} label="Your page" testId="page-link" />
          </section>
          <section className="card reviews" aria-labelledby={`reviews-${p.id}`}>
            <h2 id={`reviews-${p.id}`}>Reviews {reviews.length > 0 && <em>{reviews.length}</em>}</h2>
            {reviews.length === 0 ? (
              <p className="reviews-empty">
                No reviews yet. Send your review link to every customer after a job.
              </p>
            ) : (
              <div className="review-list">
                {reviews.map((r) => (
                  <ProviderReview key={r.id} r={r} />
                ))}
              </div>
            )}
          </section>
        </div>
      ))}
    </main>
  );
}
