import { ProUpgradeForm } from "@/components/provider/ProForms";
import { PRO_ENQUIRY_THRESHOLD } from "@/lib/enquiries";

// The Pro offer on the trader's dashboard, once they've had enough enquiries: shown in place, never sent by email or
// text, and never repeated anywhere else.

const WHAT_PRO_ADDS = [
  "An ID check: once we've seen your photo ID, your page shows “ID checked”.",
  "Up to 6 photos of your work on your page.",
  "A monthly report of your enquiries, here on your dashboard.",
];

function Includes() {
  return (
    <ul className="pro-list">
      {WHAT_PRO_ADDS.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** Stripe is set up: choose monthly or yearly, then pay on Stripe's page. */
export function ProUpgradeCard({ providerId, ended = false }: { providerId: string; ended?: boolean }) {
  return (
    <div className="pro-card pro-offer" data-testid="pro-upgrade">
      <p className="pro-title">{ended ? "Restart Pro" : "Upgrade to Pro"}</p>
      <p>
        {ended
          ? "Pick up where you left off: your photos and the ID checked mark come back as soon as you restart."
          : `You've had ${PRO_ENQUIRY_THRESHOLD} enquiries through Bolton Vouched. Pro is optional:`}
      </p>
      {!ended && <Includes />}
      <p>
        It never changes where you&apos;re listed or your badges: those come from reviews alone. Your listing stays free
        either way.
      </p>
      <ProUpgradeForm providerId={providerId} />
    </div>
  );
}

/** Stripe isn't set up yet: say what's coming, with nothing to buy. */
export function ProSoonCard() {
  return (
    <div className="pro-card" data-testid="pro-soon">
      <p className="pro-title">You&apos;ve reached {PRO_ENQUIRY_THRESHOLD} enquiries — Pro opens soon</p>
      <p>Pro will be £10 a month or £100 a year, and adds:</p>
      <Includes />
      <p>
        It never changes where you&apos;re listed or your badges, and your listing stays free either way. It&apos;ll
        show here when it&apos;s ready.
      </p>
    </div>
  );
}
