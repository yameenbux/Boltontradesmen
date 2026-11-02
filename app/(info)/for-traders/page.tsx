import type { Metadata } from "next";
import Link from "next/link";
import { ViewBeacon } from "@/components/ViewBeacon";
import { DistrictMap } from "@/components/art/DistrictMap";
import { LeadFlow } from "@/components/art/LeadFlow";
import { Scene } from "@/components/art/Scene";
import { Button } from "@/components/ui/Button";
import { TRADER_SIGN_IN } from "@/lib/account-intent";
import { FOUNDING_PLACES, FOUNDING_UNTIL, foundingPlacesLeft, placesLeftText } from "@/lib/founding";
import { foundingPlacesTaken } from "@/lib/founding-data";
import { platformPath } from "@/lib/paths";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import { stripeConfig } from "@/lib/pro";
import { pageMetadata } from "@/lib/seo";

// Public sales page for traders: the promise, the founding offer (while places are left, from the real count), how
// a job reaches them, why it beats paying per lead, where, then the free listing and Pro side by side, and the free
// website check. Rendered per request for the places left and whether Pro can be bought yet; no cookies.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "For traders: free listing, no lead fees | Bolton Vouched",
  description:
    "Bolton customers call or WhatsApp you direct, with no lead fees, ever. List free in 5 minutes. Founding traders get Pro free: job requests, quotes and invoices from your phone, and review requests.",
  path: "/for-traders",
});

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Cross = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export default async function ForTradersPage() {
  const buyable = stripeConfig() !== null;
  const left = foundingPlacesLeft(await foundingPlacesTaken());
  const founding = left !== null && left > 0;
  return (
    <main className="sell">
      <Scene labelledBy="ft-title" className="sell-hero">
        <h1 id="ft-title">Bolton jobs, straight to your phone. No lead fees. Ever.</h1>
        <ul className="promise" aria-label="The deal">
          <li>£0 per enquiry</li>
          <li>No contract</li>
          <li>Never sold on</li>
          <li>Free Facebook spotlight</li>
        </ul>
        <div className="sell-ctas">
          <Button href={TRADER_SIGN_IN}>Get listed free: 5 minutes</Button>
        </div>
        <p className="sell-login">
          Already listed? <Link href={TRADER_SIGN_IN}>Log in</Link>
        </p>
      </Scene>

      {founding && (
        <section className="founding reveal" aria-labelledby="founding-title" data-testid="founding-offer">
          <p className="founding-kick">Founding offer</p>
          <h2 id="founding-title">Pro free until {FOUNDING_UNTIL.label}</h2>
          <p>
            For the first {FOUNDING_PLACES} traders. No card, nothing to cancel: when it ends, carry on free or keep Pro
            for {PRO_PRICE.monthly}.
          </p>
          <div className="founding-count">
            <b>{placesLeftText(left)}</b>
            <span className="founding-bar" aria-hidden="true">
              <span style={{ width: `${((FOUNDING_PLACES - left) / FOUNDING_PLACES) * 100}%` }} />
            </span>
          </div>
          <Button href={TRADER_SIGN_IN}>Claim a founding place</Button>
          <p className="founding-note">We switch Pro on when we check your listing.</p>
        </section>
      )}

      <section className="sell-section" aria-labelledby="how-title">
        <h2 id="how-title" className="reveal">How it works</h2>
        <LeadFlow
          label="How it works"
          steps={["List in 5 minutes", "We check it and post your spotlight", "Customers call or WhatsApp you"]}
        />
      </section>

      <section className="sell-section" aria-labelledby="vs-title">
        <h2 id="vs-title" className="reveal">Stop paying for leads that go nowhere</h2>
        <div className="vs reveal">
          <div className="vs-col vs-them">
            <h3>Pay-per-lead sites</h3>
            <ul>
              <li>
                <Cross />
                <span>You pay for the enquiry, whether you win the job or not</span>
              </li>
              <li>
                <Cross />
                <span>The same lead can go to other traders too</span>
              </li>
              <li>
                <Cross />
                <span>Often a joining fee or a contract</span>
              </li>
            </ul>
          </div>
          <div className="vs-col vs-us">
            <h3>Bolton Vouched</h3>
            <ul>
              <li>
                <Tick />
                <span>£0 per enquiry: the customer calls or WhatsApps you</span>
              </li>
              <li>
                <Tick />
                <span>Your enquiries are yours, never sold on</span>
              </li>
              <li>
                <Tick />
                <span>Free to list, no contract, leave any time</span>
              </li>
            </ul>
          </div>
        </div>
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
          {founding && <p className="plan-founding">Free until {FOUNDING_UNTIL.label} for founding traders</p>}
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

      <section className="webcheck reveal" aria-labelledby="webcheck-title">
        <h2 id="webcheck-title">No website, or one that brings nothing in?</h2>
        <p>
          Get a free check of your website and Google profile from YSB Designs, the team behind Bolton Vouched: what&apos;s
          costing you calls, and what to fix first. No obligation.
        </p>
        <Button href="/website-check" variant="secondary">
          Get a free website check
        </Button>
      </section>

      <p className="fair reveal">
        Pro never moves you up the list. Places, scores and badges come from residents&apos; reviews alone.
      </p>
      <ViewBeacon kind="funnel" slug="for-traders" />
    </main>
  );
}
