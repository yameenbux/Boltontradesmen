import { ProUpgradeForm } from "@/components/provider/ProForms";
import { PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";

// The Pro offer on the trader's dashboard (and the public "For traders" page says the same). Shown in place, never
// sent by email or text.


function Includes() {
  return (
    <ul className="pro-list">
      {PRO_FEATURES.map((f) => (
        <li key={f.title}>
          <b>{f.title}.</b> {f.text}
        </li>
      ))}
    </ul>
  );
}

/** Stripe is set up: choose monthly or yearly, then pay on Stripe's page. */
export function ProUpgradeCard({
  providerId,
  ended = false,
  enquiries = 0,
}: {
  providerId: string;
  ended?: boolean;
  /** This month's enquiries: once there are some, the offer starts from them. */
  enquiries?: number;
}) {
  return (
    <div className="pro-card pro-offer" id="pro" data-testid="pro-upgrade">
      <p className="pro-title">{ended ? "Restart Pro" : "Upgrade to Pro"}</p>
      {!ended && enquiries > 0 && (
        <p className="pro-hook" data-testid="pro-hook">
          <b>
            You&apos;ve had {enquiries === 1 ? "1 enquiry" : `${enquiries} enquiries`} this month.
          </b>{" "}
          Pro helps you win more of them: a Request a quote button on your page, job requests and Ask Bolton
          questions sent straight to you, and quotes and invoices from your phone.
        </p>
      )}
      <p>
        {ended
          ? "Pick up where you left off: your photos and the ID checked mark come back as soon as you restart."
          : `Pro is optional, ${PRO_PRICE.monthly} or ${PRO_PRICE.annual}, and you can cancel any time:`}
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
      <p className="pro-title">Pro opens soon</p>
      <p>{`Pro will be ${PRO_PRICE.monthly} or ${PRO_PRICE.annual}, and adds:`}</p>
      <Includes />
      <p>
        It never changes where you&apos;re listed or your badges, and your listing stays free either way. It&apos;ll
        show here when it&apos;s ready.
      </p>
    </div>
  );
}
