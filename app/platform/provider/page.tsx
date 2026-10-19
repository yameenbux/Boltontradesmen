import type { Metadata } from "next";
import { ShopIcon } from "@/components/auth/icons";
import { AvailabilityForm } from "@/components/provider/AvailabilityForm";
import { EditListingForm } from "@/components/provider/EditListingForm";
import { AlertSettingsForm, type AlertSettings } from "@/components/provider/AlertSettingsForm";
import { EnquiryStats } from "@/components/provider/EnquiryStats";
import { JobRequests, type JobRequestRow } from "@/components/provider/JobRequests";
import { ListingStatus } from "@/components/provider/ListingStatus";
import { ProSoonCard, ProUpgradeCard } from "@/components/provider/ProOffer";
import { ProPanel } from "@/components/provider/ProPanel";
import { ReplyForm } from "@/components/provider/ReplyForm";
import { ShareReviewLink } from "@/components/review-card/ShareReviewLink";
import { WebsiteBadge } from "@/components/share/WebsiteBadge";
import { CONTACT_EMAIL, MAILTO } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { setMyAvailability } from "@/app/platform/provider/actions";
import { saveAlertSettings } from "@/app/platform/provider/jobs-actions";
import { nationalNumber } from "@/lib/alert-text";
import { requireMember } from "@/lib/auth";
import { availabilityNow, bookedRange, type StoredAvailability } from "@/lib/availability";
import { dayMonthYear } from "@/lib/checks";
import { toEnquiryStats } from "@/lib/enquiries";
import { platformPath } from "@/lib/paths";
import { stripeConfig, toProStatus } from "@/lib/pro";
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
  description: "Your Bolton Vouched listing: enquiries, reviews and replies, and changes to your page.",
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
  provider: {
    id: string;
    slug: string;
    business_name: string;
    status: string;
    availability?: StoredAvailability;
    bio?: string | null;
    areas?: string[];
    categories?: string[];
    paused_by?: "trader" | "admin" | null;
  };
  reviews: Review[];
};

const STATUS_NOTE: Record<string, string> = {
  paused: "Your listing is paused, so customers can't see it.",
  consented: "Your listing isn't live yet, so customers can't see it.",
  invited: "Your listing isn't live yet, so customers can't see it.",
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

export default async function ProviderArea({
  searchParams,
}: {
  searchParams: Promise<{ withdrawn?: string; pro?: string }>;
}) {
  const { supabase } = await requireMember(platformPath("provider"));
  const { withdrawn, pro: proParam } = await searchParams;
  const { data, error } = await supabase.rpc("provider_my_reviews");
  if (error) throw new Error(`provider_my_reviews failed: ${error.message}`);
  const listings = (data ?? []) as Listing[];

  if (listings.length === 0) {
    return (
      <main className="auth">
        <section className="auth-card" aria-labelledby="provider-title">
          {withdrawn === "1" ? (
            <div>
              <p className="eyebrow">Your listing</p>
              <h1 id="provider-title">Your listing is withdrawn</h1>
              <p className="lede">
                It&apos;s off Bolton Vouched now. Thanks for being part of it. If you&apos;d like to be listed again,
                email <a href={MAILTO}>{CONTACT_EMAIL}</a> and we&apos;ll send you a new invite.
              </p>
            </div>
          ) : (
            <div>
              <p className="eyebrow">Your listing</p>
              <h1 id="provider-title">No listing found</h1>
              <p className="lede">
                We couldn&apos;t find a listing linked to your account. If you&apos;re listed, ask us for your trader
                sign-in link.
              </p>
            </div>
          )}
          <Button href={platformPath("account")} variant="secondary">
            Back to your account
          </Button>
        </section>
      </main>
    );
  }

  // Each listing's enquiry counts and Pro (the trader's own listings only: the database checks).
  const [stats, pros] = await Promise.all([
    Promise.all(
      listings.map(async ({ provider: p }) => {
        const { data: s, error: e } = await supabase.rpc("my_enquiry_stats", { p_provider: p.id });
        if (e) throw new Error(`my_enquiry_stats failed: ${e.message}`);
        return toEnquiryStats(s);
      }),
    ),
    Promise.all(
      listings.map(async ({ provider: p }) => {
        const { data: s, error: e } = await supabase.rpc("my_pro_status", { p_provider: p.id });
        if (e) throw new Error(`my_pro_status failed: ${e.message}`);
        return toProStatus(s);
      }),
    ),
  ]);
  // Pro's job requests and alert settings, for listings with Pro on.
  const jobs = await Promise.all(
    listings.map(async ({ provider: p }, i) => {
      if (!pros[i].isPro) return null;
      const [req, set] = await Promise.all([
        supabase.rpc("my_job_requests", { p_provider: p.id }),
        supabase.rpc("my_alert_settings", { p_provider: p.id }),
      ]);
      if (req.error) throw new Error(`my_job_requests failed: ${req.error.message}`);
      if (set.error) throw new Error(`my_alert_settings failed: ${set.error.message}`);
      return { requests: (req.data ?? []) as JobRequestRow[], settings: set.data as AlertSettings };
    }),
  );
  // Without all four Stripe settings the offer says "Pro opens soon" and nothing can be bought.
  const stripeReady = stripeConfig() !== null;

  return (
    <main className="auth">
      {listings.map(({ provider: p, reviews }, i) => (
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
              How your page is doing, and everything you can change on it. Reply to any review: your reply shows under
              it straight away, and you can edit it for 14 days.
            </p>
            {p.status !== "live" && (
              <p className="form-alert">{STATUS_NOTE[p.status] ?? "Your listing isn't live right now."}</p>
            )}
            {proParam === "success" && !pros[i].isPro && (
              <p className="form-ok" role="status">
                Thanks, your payment went through. Pro switches on as soon as Stripe confirms it, usually within a
                minute: refresh this page to see it.
              </p>
            )}
            <Button href={platformPath("p", p.slug)} variant="secondary">
              See your public page
            </Button>
          </section>

          <section className="auth-card" aria-labelledby={`stats-${p.id}`}>
            <h2 id={`stats-${p.id}`}>Enquiries</h2>
            <EnquiryStats
              stats={stats[i]}
              id={`chart-${p.id}`}
              isPro={pros[i].isPro}
              offer={
                stripeReady ? (
                  <ProUpgradeCard
                    providerId={p.id}
                    ended={!!pros[i].subscription && pros[i].subscription?.status !== "incomplete"}
                  />
                ) : (
                  <ProSoonCard />
                )
              }
            />
          </section>

          {jobs[i] && (
            <section className="auth-card" id="requests" aria-labelledby={`requests-${p.id}`}>
              <div>
                <h2 id={`requests-${p.id}`}>
                  Job requests {jobs[i].requests.length > 0 && <em>{jobs[i].requests.length}</em>}
                </h2>
                <p className="lede">From &ldquo;Request a quote&rdquo; on your page. Only you see these.</p>
              </div>
              <JobRequests requests={jobs[i].requests} business={p.business_name} />
            </section>
          )}
          {jobs[i] && (
            <section className="auth-card" aria-labelledby={`alerts-${p.id}`}>
              <div>
                <h2 id={`alerts-${p.id}`}>Alerts</h2>
                <p className="lede">
                  We text and email you when a job request comes in, and when someone in your areas asks Bolton for
                  your trade. Up to 10 texts a day.
                </p>
              </div>
              <AlertSettingsForm
                action={saveAlertSettings.bind(null, p.id)}
                settings={jobs[i].settings}
                defaultSms={
                  jobs[i].settings.sms && !jobs[i].settings.custom_sms ? nationalNumber(jobs[i].settings.sms) : null
                }
              />
            </section>
          )}

          {(pros[i].subscription || pros[i].photos.length > 0 || pros[i].documents.length > 0) && (
            <ProPanel
              providerId={p.id}
              businessName={p.business_name}
              pro={pros[i]}
              stats={stats[i]}
              billing={stripeReady}
            />
          )}

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
          <section className="auth-card" aria-labelledby={`page-${p.id}`}>
            <div>
              <h2 id={`page-${p.id}`}>Share your page</h2>
              <p className="lede">Send your page to anyone who asks for a recommendation.</p>
            </div>
            <ShareReviewLink {...pageShare(p.slug, p.business_name)} label="Your page" testId="page-link" />
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
          <section className="card reviews" aria-labelledby={`reviews-${p.id}`}>
            <h2 id={`reviews-${p.id}`}>Reviews {reviews.length > 0 && <em>{reviews.length}</em>}</h2>
            {reviews.length === 0 ? (
              <p className="reviews-empty">No reviews yet. Send your review link to every customer after a job.</p>
            ) : (
              <div className="review-list">
                {reviews.map((r) => (
                  <ProviderReview key={r.id} r={r} />
                ))}
              </div>
            )}
          </section>

          <section className="auth-card" aria-labelledby={`edit-${p.id}`}>
            <div>
              <h2 id={`edit-${p.id}`}>Edit your listing</h2>
              <p className="lede">Changes show on your page straight away.</p>
            </div>
            <EditListingForm providerId={p.id} bio={p.bio ?? null} areas={p.areas ?? []} />
            <div className="trades">
              <p className="trades-label">Your trades</p>
              <p className="trades-list">{(p.categories ?? []).join(" · ") || "None yet"}</p>
              <p className="avail-hint">
                To change your trades, email <a href={MAILTO}>{CONTACT_EMAIL}</a>. Some trades need a check first (Gas
                Safe, driving instructors), so we make that change.
              </p>
            </div>
            <ListingStatus providerId={p.id} status={p.status} pausedBy={p.paused_by ?? null} />
          </section>
        </div>
      ))}
    </main>
  );
}

