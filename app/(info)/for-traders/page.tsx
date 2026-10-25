import type { Metadata } from "next";
import { DistrictMap } from "@/components/art/DistrictMap";
import { LeadFlow } from "@/components/art/LeadFlow";
import { Scene } from "@/components/art/Scene";
import { Button } from "@/components/ui/Button";
import { TRADER_SIGN_IN } from "@/lib/account-intent";
import { platformPath } from "@/lib/paths";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import { stripeConfig } from "@/lib/pro";
import { pageMetadata } from "@/lib/seo";

// Public sales page for traders: the promise, how a job reaches them, where, then the free listing and Pro side by
// side. Rendered per request only to know whether Pro can be bought yet (Stripe set up); no cookies.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "For traders: free listing and Pro | Bolton Vouched",
  description:
    "List your trade on Bolton Vouched for free: customers call or WhatsApp you direct, with no lead fees. Pro (£10 a month) adds job requests, quotes and invoices from your phone, and review requests.",
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
    <main className="sell">
      <Scene labelledBy="ft-title" className="sell-hero">
        <h1 id="ft-title">More work from Bolton, without paying per lead</h1>
        <ul className="promise" aria-label="The deal">
          <li>No lead fees</li>
          <li>No contract</li>
          <li>Never sold on</li>
        </ul>
        <div className="sell-ctas">
          <Button href={TRADER_SIGN_IN}>Get listed free</Button>
          <Button href={TRADER_SIGN_IN} variant="secondary">
            Log in
          </Button>
        </div>
      </Scene>

      <section className="sell-section" aria-labelledby="how-title">
        <h2 id="how-title" className="reveal">How a job reaches you</h2>
        <LeadFlow
          label="How a job reaches you"
          steps={["Neighbours find you", "They call or WhatsApp you", "Their review brings the next job"]}
        />
      </section>

      <section className="sell-section sell-area" aria-labelledby="area-title">
        <h2 id="area-title" className="reveal">All of Bolton, BL1 to BL7</h2>
        <DistrictMap />
      </section>

      <div className="plans">
        <section className="plan reveal" aria-labelledby="free-title">
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
          <Button href={TRADER_SIGN_IN} variant="secondary">
            Get listed free
          </Button>
        </section>

        <section className="plan plan-pro reveal" aria-labelledby="pro-title">
          <div className="plan-head">
            <h2 id="pro-title">Pro</h2>
            <p className="plan-price">
              <b>£10</b> a month, or {PRO_PRICE.annual}
            </p>
          </div>
          <ul className="plan-list">
            <li>
              <Tick />
              <span>Everything in the free listing</span>
            </li>
            {PRO_FEATURES.map((f) => (
              <li key={f.title}>
                <Tick />
                <span>{f.title}</span>
              </li>
            ))}
          </ul>
          <ol className="plan-steps" aria-label="How to get Pro">
            <li>Join and choose Pro</li>
            <li>We check your details by hand</li>
            <li>{buyable ? "Pay by card and Pro switches on" : "Pay from your listing once Pro opens"}</li>
          </ol>
          <div className="plan-ctas">
            <Button href={TRADER_SIGN_IN}>Join as a trader with Pro</Button>
            <Button href={platformPath("provider")} variant="secondary">
              Already listed? {buyable ? "Upgrade now" : "Your listing"}
            </Button>
          </div>
          <p className="plan-note">Cancel any time. No VAT to add.</p>
        </section>
      </div>

      <p className="fair reveal">
        Pro never moves you up the list. Places, scores and badges come from residents&apos; reviews alone.
      </p>
    </main>
  );
}
