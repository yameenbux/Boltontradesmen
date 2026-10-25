import { TickIcon } from "@/components/auth/icons";
import { TraderSetupForm } from "@/components/provider/TraderSetupForm";
import { SUPPORT_WHATSAPP_DISPLAY, whatsappTicket } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { consentStatement } from "@/lib/consent-text";
import { platformPath } from "@/lib/paths";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import type { MyListingRequest } from "@/lib/trader-setup";

export const LINK_ME_WHATSAPP = whatsappTicket(
  "Hi, I'm already listed on Bolton Vouched. Please send me the link to connect my listing to my account. Business name: …",
);

/** What was sent and what happens next: approval, then a notification (and, for Pro, the payment link). */
function SentForReview({ request }: { request: MyListingRequest }) {
  const pro = request.plan === "pro";
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="provider-title" data-testid="sent-for-review">
        <div>
          <p className="eyebrow">Sent for review</p>
          <h1 id="provider-title">Thanks, we&apos;ve got your details</h1>
          <p className="lede">
            <b>{request.business_name}</b> is with us for review. Once it&apos;s approved, you&apos;ll get a notification by
            email and text, usually within 2 working days.
          </p>
        </div>
      </section>

      <section className={`auth-card plan${pro ? " plan-pro" : ""}`} aria-labelledby="your-plan-title">
        <div className="plan-head">
          <h2 id="your-plan-title">Your listing: {pro ? "Pro" : "Free"}</h2>
          <p className="plan-price">
            {pro ? (
              <>
                <b>£10</b> a month, or {PRO_PRICE.annual}
              </>
            ) : (
              <>
                <b>£0</b> for good
              </>
            )}
          </p>
        </div>
        {pro && <p className="plan-sub">Everything in Free, plus:</p>}
        <ul className="plan-list">
          {(pro ? PRO_FEATURES.map((f) => f.title) : FREE_FEATURES).map((f) => (
            <li key={f}>
              <TickIcon />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="plan-note">
          {pro
            ? "Nothing to pay yet. When you're approved, your notification takes you straight to pay by card, and Pro switches on as soon as you do. Cancel any time."
            : "Free, for good: no card, nothing to pay. You can add Pro any time from your listing page."}
        </p>
      </section>

      <p className="lede">
        Got something wrong? WhatsApp us on{" "}
        <a href={whatsappTicket(`Hi, about my Bolton Vouched request for ${request.business_name}: …`)}>
          {SUPPORT_WHATSAPP_DISPLAY}
        </a>
        .
      </p>
      <Button href={platformPath()} variant="secondary">
        Browse Bolton Vouched
      </Button>
    </main>
  );
}

/**
 * The trader start, for a signed-in account with no listing linked: one form (business, area, mobile, Free or Pro,
 * the listing statement) that puts the listing live. "Sent for review" is only for a request sent before sign-ups
 * went live straight away. An existing listing is linked by the one-time link we send.
 */
export function TraderStart({
  needsName,
  trades,
  request,
}: {
  needsName: boolean;
  trades: string[];
  request: MyListingRequest | null;
}) {
  if (request) return <SentForReview request={request} />;
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="provider-title">
        <div>
          <p className="eyebrow">For traders</p>
          <h1 id="provider-title">Tell us about your business</h1>
          <p className="lede">One short form, and your listing goes live straight away.</p>
        </div>
        <TraderSetupForm needsName={needsName} trades={trades} cards={consentStatement()?.cards ?? []} />
      </section>
      <p className="lede">
        Already listed? <a href={LINK_ME_WHATSAPP}>WhatsApp us</a> and we&apos;ll send the link that connects it to this
        account.
      </p>
      <p className="lede">
        Not a trader? <a href={platformPath()}>Find a trader instead</a>.
      </p>
    </main>
  );
}
