import type { Metadata } from "next";
import { ShopIcon } from "@/components/auth/icons";
import { ReplyForm } from "@/components/provider/ReplyForm";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { requireMember } from "@/lib/auth";
import { dayMonthYear } from "@/lib/checks";
import { platformPath } from "@/lib/paths";
import { stillOpen } from "@/lib/review-form";
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
type Listing = { provider: { id: string; slug: string; business_name: string; status: string }; reviews: Review[] };

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
          <section className="card reviews" aria-labelledby={`reviews-${p.id}`}>
            <h2 id={`reviews-${p.id}`}>Reviews {reviews.length > 0 && <em>{reviews.length}</em>}</h2>
            {reviews.length === 0 ? (
              <p className="reviews-empty">
                No reviews yet. Share your page with happy customers and ask them to leave one.
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
