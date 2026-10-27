import type { Metadata } from "next";
import { ShopIcon } from "@/components/auth/icons";
import { AvailabilityForm } from "@/components/provider/AvailabilityForm";
import { BrandColorForm, LogoForm } from "@/components/provider/BrandingForms";
import { EditListingForm } from "@/components/provider/EditListingForm";
import { AlertSettingsForm, type AlertSettings } from "@/components/provider/AlertSettingsForm";
import { textsAvailable } from "@/lib/sms-hook";
import { EnquiryStats } from "@/components/provider/EnquiryStats";
import { Insights } from "@/components/provider/Insights";
import { JobRequests, type JobRequestRow } from "@/components/provider/JobRequests";
import { BillingForm } from "@/components/docs/BillingForm";
import { ChaseList } from "@/components/docs/ChaseList";
import { DocList } from "@/components/docs/DocList";
import { ListingStatus } from "@/components/provider/ListingStatus";
import { ProSoonCard, ProUpgradeCard } from "@/components/provider/ProOffer";
import { ProPanel } from "@/components/provider/ProPanel";
import { CardPaymentsForm } from "@/components/provider/ProForms";
import { ReplyForm } from "@/components/provider/ReplyForm";
import { TraderStart } from "@/components/provider/TraderStart";
import { ShareReviewLink } from "@/components/review-card/ShareReviewLink";
import { GoogleProfileLink } from "@/components/share/GoogleProfileLink";
import { WebsiteBadge } from "@/components/share/WebsiteBadge";
import { CONTACT_EMAIL, MAILTO } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { setMyAvailability } from "@/app/(platform)/provider/actions";
import { saveAlertSettings } from "@/app/(platform)/provider/jobs-actions";
import { saveBilling } from "@/app/(platform)/provider/docs/actions";
import type { Billing, TradeDoc } from "@/lib/trade-docs";
import { nationalNumber } from "@/lib/alert-text";
import { requireAccount } from "@/lib/auth";
import { availabilityNow, bookedRange, type StoredAvailability } from "@/lib/availability";
import { isBrandColor, logoUrl } from "@/lib/brand";
import { dayMonthYear } from "@/lib/checks";
import { toEnquiryStats } from "@/lib/enquiries";
import { quotesToChase, toInsights } from "@/lib/insights";
import { platformPath } from "@/lib/paths";
import { stripeConfig, toProStatus } from "@/lib/pro";
import { refreshAccount } from "@/lib/card-payments";
import { toCardState } from "@/lib/card-state";
import { stillOpen } from "@/lib/review-form";
import { tradeGroups } from "@/lib/trade-names";
import type { MyListingRequest } from "@/lib/trader-setup";
import { reviewShare } from "@/lib/review-link";
import { badgeShare, googleProfileLink, pageShare } from "@/lib/share";
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
  searchParams: Promise<{ withdrawn?: string; pro?: string; card?: string }>;
}) {
  // No Welcome here: a new trader's account gets its name from the trader form.
  const { supabase, account } = await requireAccount(platformPath("provider"));
  const { withdrawn, pro: proParam, card: cardParam } = await searchParams;
  const textsOn = textsAvailable();
  let listings: Listing[] = [];
  if (account?.displayName) {
    const { data, error } = await supabase.rpc("provider_my_reviews");
    if (error) throw new Error(`provider_my_reviews failed: ${error.message}`);
    listings = (data ?? []) as Listing[];
  }

  if (listings.length === 0) {
    if (withdrawn !== "1") {
      const [{ data: req, error: reqError }, groups] = await Promise.all([
        supabase.rpc("my_listing_request"),
        tradeGroups(),
      ]);
      if (reqError) throw new Error(`my_listing_request failed: ${reqError.message}`);
      return (
        <TraderStart
          needsName={!account?.displayName}
          groups={groups}
          request={(req as MyListingRequest | null) ?? null}
        />
      );
    }
    return (
      <main className="auth">
        <section className="auth-card" aria-labelledby="provider-title">
          <div>
            <p className="eyebrow">Your listing</p>
            <h1 id="provider-title">Your listing is withdrawn</h1>
            <p className="lede">
              It&apos;s off Bolton Vouched now. Thanks for being part of it. If you&apos;d like to be listed again, email{" "}
              <a href={MAILTO}>{CONTACT_EMAIL}</a> and we&apos;ll send you a new invite.
            </p>
          </div>
          <Button href={platformPath("account")} variant="secondary">
            Back to your account
          </Button>
        </section>
      </main>
    );
  }

  // Each listing's enquiry counts, Pro and look (the trader's own listings only: the database checks).
  const [stats, pros, looks, insights] = await Promise.all([
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
    Promise.all(
      listings.map(async ({ provider: p }) => {
        const { data: s, error: e } = await supabase.rpc("my_branding", { p_provider: p.id });
        if (e) throw new Error(`my_branding failed: ${e.message}`);
        const b = (s ?? {}) as { logo_path?: unknown; brand_color?: unknown };
        return {
          logo: logoUrl(typeof b.logo_path === "string" ? b.logo_path : null),
          color: isBrandColor(b.brand_color) ? b.brand_color : null,
        };
      }),
    ),
    Promise.all(
      listings.map(async ({ provider: p }) => {
        const { data: s, error: e } = await supabase.rpc("my_insights", { p_provider: p.id });
        if (e) throw new Error(`my_insights failed: ${e.message}`);
        return toInsights(s);
      }),
    ),
  ]);
  // Pro's job requests and alert settings, for listings with Pro on.
  const jobs = await Promise.all(
    listings.map(async ({ provider: p }, i) => {
      if (!pros[i].isPro) return null;
      // Back from Stripe, or still waiting on it: ask Stripe whether the account can take payments yet.
      const cfg = stripeConfig();
      if (cfg && process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()) {
        const { data: c } = await supabase.rpc("my_card_payments", { p_provider: p.id });
        const known = toCardState(c);
        if (known.connected && !known.chargesEnabled) await refreshAccount(cfg, p.id);
      }
      const [req, set, docs, bank, card] = await Promise.all([
        supabase.rpc("my_job_requests", { p_provider: p.id }),
        supabase.rpc("my_alert_settings", { p_provider: p.id }),
        supabase.rpc("my_docs", { p_provider: p.id }),
        supabase.rpc("my_billing", { p_provider: p.id }),
        supabase.rpc("my_card_payments", { p_provider: p.id }),
      ]);
      if (req.error) throw new Error(`my_job_requests failed: ${req.error.message}`);
      if (set.error) throw new Error(`my_alert_settings failed: ${set.error.message}`);
      if (docs.error) throw new Error(`my_docs failed: ${docs.error.message}`);
      if (bank.error) throw new Error(`my_billing failed: ${bank.error.message}`);
      if (card.error) throw new Error(`my_card_payments failed: ${card.error.message}`);
      return {
        requests: (req.data ?? []) as JobRequestRow[],
        settings: set.data as AlertSettings,
        docs: (docs.data ?? []) as TradeDoc[],
        billing: (bank.data ?? null) as Billing | null,
        card: toCardState(card.data),
      };
    }),
  );
  // Without all four Stripe settings the offer says "Pro opens soon" and nothing can be bought.
  const stripeReady = stripeConfig() !== null;
  // Quote follow-up emails go out from the daily job, which only runs with CRON_SECRET set.
  const followupsOn = !!process.env.CRON_SECRET?.trim();
  // Card payments need Stripe Connect switched on for our account, shown by its webhook's secret being set.
  const cardReady = stripeReady && !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();

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

          <section className="auth-card" aria-labelledby={`look-${p.id}`}>
            <h2 id={`look-${p.id}`}>Your page&apos;s look</h2>
            <LogoForm providerId={p.id} slug={p.slug} current={looks[i].logo} />
            {pros[i].isPro ? (
              <BrandColorForm providerId={p.id} slug={p.slug} current={looks[i].color} />
            ) : (
              <p className="hint">With Pro, your page also gets a cover in your own colour, behind your logo.</p>
            )}
          </section>

          <section className="auth-card" aria-labelledby={`looking-${p.id}`}>
            <h2 id={`looking-${p.id}`}>Who&apos;s looking</h2>
            <Insights data={insights[i]} id={p.id} />
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
                    enquiries={stats[i].thisMonth.enquiries}
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
              <JobRequests requests={jobs[i].requests} business={p.business_name} textsOn={textsOn} />
            </section>
          )}
          {jobs[i] && (
            <section className="auth-card" id="docs" aria-labelledby={`docs-${p.id}`}>
              <div>
                <h2 id={`docs-${p.id}`}>Quotes and invoices</h2>
                <p className="lede">
                  Make one on your phone, send it on WhatsApp, and your customer accepts or pays from the link. When
                  you mark an invoice paid, we ask them for an honest review.
                </p>
              </div>
              <div className="doc-new">
                <Button href={`${platformPath("provider", "docs", "new")}?kind=quote&listing=${p.id}`}>New quote</Button>
                <Button href={`${platformPath("provider", "docs", "new")}?kind=invoice&listing=${p.id}`} variant="secondary">
                  New invoice
                </Button>
              </div>
              <ChaseList chases={quotesToChase(jobs[i].docs)} business={p.business_name} emailsOn={followupsOn} />
              <DocList docs={jobs[i].docs} />
              <div className="doc-bank">
                <h3>Your bank details for invoices</h3>
                <p className="avail-hint">Printed on your invoices so customers can pay you by bank transfer.</p>
                <BillingForm action={saveBilling.bind(null, p.id)} billing={jobs[i].billing} />
              </div>
            </section>
          )}
          {jobs[i] && cardReady && (
            <section className="auth-card" id="card" aria-labelledby={`card-${p.id}`}>
              <div>
                <h2 id={`card-${p.id}`}>Card payments</h2>
                <p className="lede">
                  Customers pay your invoices, and deposits on quotes, by card, straight into your own Stripe account.
                  We take nothing: Stripe charges its usual fee on each payment, and refunds are done from your Stripe
                  dashboard.
                </p>
              </div>
              {jobs[i].card.chargesEnabled ? (
                <>
                  <p className="form-ok" data-testid="card-status">
                    Card payments are on. Your invoices and deposits show &ldquo;Pay by card&rdquo;.
                  </p>
                  <a className="link" href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                    Open your Stripe dashboard
                  </a>
                </>
              ) : (
                <>
                  {jobs[i].card.connected && (
                    <p className="form-note" data-testid="card-status">
                      {cardParam === "back"
                        ? "Thanks. Stripe is checking your details; this usually takes a few minutes. Refresh to see."
                        : "Stripe needs a few more details before you can take payments."}
                    </p>
                  )}
                  <CardPaymentsForm providerId={p.id} started={jobs[i].card.connected} />
                </>
              )}
            </section>
          )}
          {jobs[i] && (
            <section className="auth-card" aria-labelledby={`alerts-${p.id}`}>
              <div>
                <h2 id={`alerts-${p.id}`}>Alerts</h2>
                <p className="lede">
                  We let you know straight away when a job request comes in, and when someone in your areas asks
                  Bolton for your trade.{" "}
                  {textsOn ? "By text (up to 10 a day) and email." : "By email for now: texts are coming soon."}
                </p>
              </div>
              <AlertSettingsForm
                textsOn={textsOn}
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
          {p.status === "live" && (
            <section className="auth-card" aria-labelledby={`google-${p.id}`}>
              <div>
                <h2 id={`google-${p.id}`}>Put it on Google</h2>
                <p className="lede">
                  Most customers start on Google. Add your page as the website on your Google Business Profile, so
                  people who find you there can read your reviews.
                </p>
              </div>
              <GoogleProfileLink link={googleProfileLink(p.slug)} />
            </section>
          )}
          <section className="auth-card" aria-labelledby={`badge-${p.id}`}>
            <div>
              <h2 id={`badge-${p.id}`}>Your website badge</h2>
              <p className="lede">
                Put it on your website or Facebook page, or print it for your van. It links to your page here and
                shows your rating badge once you&apos;ve earned one. No website? Your page is your website: put its
                link in your WhatsApp Business, Facebook, Instagram and Google profiles.
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

