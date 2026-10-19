import type { Metadata } from "next";
import { GET_LISTED } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import { stripeConfig } from "@/lib/pro";
import { pageMetadata } from "@/lib/seo";

// Public: what a trader gets free, and what Pro adds. Rendered per request only to know whether Pro can be bought
// yet (Stripe set up); no cookies.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "For traders: free listing and Pro | Bolton Vouched",
  description:
    "List your trade on Bolton Vouched for free: customers call or WhatsApp you direct, with no lead fees. Pro (£10 a month) adds job requests by text, quotes and invoices from your phone, and review requests.",
  path: "/for-traders",
});

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export default function ForTradersPage() {
  const buyable = stripeConfig() !== null;
  return (
    <main className="auth trade-plans">
      <section className="auth-card" aria-labelledby="ft-title">
        <div>
          <p className="eyebrow">For traders</p>
          <h1 id="ft-title">More work from Bolton, without paying per lead</h1>
          <p className="lede">
            Bolton residents find you through neighbours&apos; reviews and contact you direct. No lead fees, no contract,
            and your enquiries are never sold to anyone else.
          </p>
        </div>
        <Button href={GET_LISTED}>Get listed free</Button>
      </section>

      <section className="auth-card plan" aria-labelledby="free-title">
        <div className="plan-head">
          <h2 id="free-title">Free listing</h2>
          <p className="plan-price">
            <b>£0</b> for good
          </p>
        </div>
        <ul className="plan-list">
          {FREE_FEATURES.map((f) => (
            <li key={f}>
              <Tick />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Button href={GET_LISTED} variant="secondary">
          Get listed free
        </Button>
      </section>

      <section className="auth-card plan plan-pro" aria-labelledby="pro-title">
        <div className="plan-head">
          <h2 id="pro-title">Pro</h2>
          <p className="plan-price">
            <b>£10</b> a month, or {PRO_PRICE.annual}
          </p>
        </div>
        <p className="plan-sub">Everything in the free listing, plus:</p>
        <ul className="plan-list">
          {PRO_FEATURES.map((f) => (
            <li key={f.title}>
              <Tick />
              <span>
                <b>{f.title}.</b> {f.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="plan-note">Cancel any time. No VAT to add.</p>
        <ol className="plan-steps" aria-label="How to get Pro">
          <li>Get listed (free): we check your details and you see your page before it goes live.</li>
          <li>Sign in to your listing page.</li>
          <li>{buyable ? "Choose Pro, monthly or yearly, and pay by card. It switches on straight away." : "Choose Pro there as soon as it opens."}</li>
        </ol>
        <div className="plan-ctas">
          <Button href={GET_LISTED}>Get listed, then go Pro</Button>
          <Button href={platformPath("provider")} variant="secondary">
            Already listed? {buyable ? "Upgrade now" : "Your listing"}
          </Button>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="fair-title">
        <h2 id="fair-title">Fair to everyone</h2>
        <p>
          Pro never moves you up the list or changes your score or badges: those come from residents&apos; reviews
          alone, so residents can trust them. Pro gets you more out of each enquiry and saves you time; it doesn&apos;t
          buy you a better place.
        </p>
      </section>
    </main>
  );
}
