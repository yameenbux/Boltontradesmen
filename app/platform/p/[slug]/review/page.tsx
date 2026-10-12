import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertIcon, ClockIcon } from "@/components/auth/icons";
import { ReviewForm, type ReviewValues } from "@/components/review/ReviewForm";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { requireMember } from "@/lib/auth";
import { dayMonthYear } from "@/lib/checks";
import { platformPath } from "@/lib/paths";
import { recentMonths, REVIEW_ERRORS, REVIEW_FALLBACK_ERROR, statusLabel, stillOpen } from "@/lib/review-form";
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
  title: "Leave a review | Bolton Vouched",
  description: "Tell Bolton how the job went: a few quick taps and a line or two.",
  robots: { index: false },
};

type Existing = {
  id: string;
  category_id: string;
  job_month: string;
  value_band: ValueBand;
  on_time: OnTime;
  on_price: OnPrice;
  quality: number;
  tidy: boolean | null;
  use_again: UseAgain;
  comment: string | null;
  status: "published" | "under_check";
  editable_until: string;
  has_active_proof: boolean;
};
type Context = {
  provider: { id: string; slug: string; business_name: string };
  categories: { id: string; name: string; asks_tidy: boolean }[];
  existing: Existing | null;
  blocked: string | null;
};

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

function toValues(e: Existing): ReviewValues {
  return {
    category_id: e.category_id,
    job_month: e.job_month.slice(0, 7),
    value_band: e.value_band,
    on_time: e.on_time,
    on_price: e.on_price,
    quality: String(e.quality),
    tidy: e.tidy === null ? "" : e.tidy ? "yes" : "no",
    use_again: e.use_again,
    comment: e.comment ?? "",
  };
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, account } = await requireMember(platformPath("p", slug, "review"));
  const { data, error } = await supabase.rpc("review_form_context", { p_slug: slug });
  if (error) throw new Error(`review_form_context failed: ${error.message}`);
  const ctx = data as Context | null;
  if (!ctx) notFound();

  const name = ctx.provider.business_name;
  const profile = platformPath("p", ctx.provider.slug);
  const e = ctx.existing;
  const editable = e ? stillOpen(e.editable_until) : false;
  const back = (
    <a href={profile} className="back press">
      <Chevron />
      {name}
    </a>
  );

  if (!e && ctx.blocked) {
    return (
      <main className="auth">
        {back}
        <section className="auth-card" aria-labelledby="review-title">
          <div>
            <p className="eyebrow">Leave a review</p>
            <h1 id="review-title">{name}</h1>
          </div>
          {ctx.blocked === "new_account_limit" ? (
            // Not an error: a short wait for brand-new accounts, so it reads as information.
            <p role="status" className="form-note">
              <ClockIcon />
              {REVIEW_ERRORS.new_account_limit}
            </p>
          ) : (
            <p role="alert" className="form-alert">
              <AlertIcon />
              {(REVIEW_ERRORS as Record<string, string>)[ctx.blocked] ?? REVIEW_FALLBACK_ERROR}
            </p>
          )}
          <Button href={profile} variant="secondary">
            Back to {name}
          </Button>
        </section>
      </main>
    );
  }

  if (e && !editable) {
    const answers = [
      USE_AGAIN_TEXT[e.use_again],
      ON_TIME_TEXT[e.on_time],
      ON_PRICE_TEXT[e.on_price],
      e.tidy === null ? null : e.tidy ? "Left it tidy" : "Didn't leave it tidy",
      VALUE_BAND_TEXT[e.value_band],
      `Quality ${e.quality} out of 5`,
    ].filter((a): a is string => a !== null);
    return (
      <main className="auth">
        {back}
        <section className="auth-card" aria-labelledby="review-title">
          <div>
            <p className="eyebrow">Your review</p>
            <h1 id="review-title">{name}</h1>
            <p className="lede">
              Job in {monthYear(e.job_month)} · {statusLabel(e.status)}
            </p>
          </div>
          <ul className="answer-tags" aria-label="Your answers">
            {answers.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {e.comment && <p className="my-comment">{e.comment}</p>}
          <p className="closed">
            <Pill tone="muted">Edit closed</Pill>
            <span>{REVIEW_ERRORS.edit_window_closed}</span>
          </p>
          <Button href={profile} variant="secondary">
            Back to {name}
          </Button>
        </section>
      </main>
    );
  }

  const until = e ? (dayMonthYear(e.editable_until) ?? "") : "";
  return (
    <main className="auth review-page">
      {back}
      <ReviewForm
        slug={ctx.provider.slug}
        providerId={ctx.provider.id}
        businessName={name}
        displayName={account.displayName ?? ""}
        categories={ctx.categories.map((c) => ({ id: c.id, name: c.name, asksTidy: c.asks_tidy }))}
        months={recentMonths(new Date())}
        existing={e ? { id: e.id, values: toValues(e), editableUntil: until, hasProof: e.has_active_proof } : undefined}
        header={
          <section className="auth-card" aria-labelledby="review-title">
            <div>
              <p className="eyebrow">{e ? "Edit your review" : "Leave a review"}</p>
              <h1 id="review-title">How did {name} do?</h1>
              <p className="lede">
                {e
                  ? "Change anything that's not right. The checks run again when you save."
                  : "A few taps, about a minute. Your review goes live straight away."}
              </p>
            </div>
            {ctx.categories.length === 1 && (
              <p className="job-type">
                <span>Job</span>
                <b>{ctx.categories[0].name}</b>
              </p>
            )}
          </section>
        }
      />
    </main>
  );
}
