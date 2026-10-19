import { chartBars, plural, type EnquiryStats as Stats } from "@/lib/enquiries";

// The trader's dashboard numbers (and the admin's copy of them): a "This month" strip, all time, six months of
// enquiries as bars, and the Pro offer until Pro is on. Server-rendered; every number is in the text, so the bars
// are decoration for screen readers.

function Strip({ stats }: { stats: Stats }) {
  const items = [
    ["Enquiries", stats.thisMonth.enquiries],
    ["Calls", stats.thisMonth.calls],
    ["WhatsApps", stats.thisMonth.whatsapps],
    ["Reviews", stats.reviewsThisMonth],
  ] as const;
  return (
    <dl className="stat-strip" data-testid="stats-this-month">
      {items.map(([label, value]) => (
        <div key={label} className="stat">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Chart({ stats, id }: { stats: Stats; id: string }) {
  const bars = chartBars(stats.months);
  if (bars.length === 0) return null;
  return (
    <figure className="echart" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`}>Enquiries, last 6 months</figcaption>
      <ol className="echart-bars" data-testid="enquiry-chart">
        {bars.map((b) => (
          <li key={b.month} className={b.current ? "is-now" : undefined}>
            <span className="sr-only">{b.label}</span>
            <span className="echart-val" aria-hidden="true">
              {b.value}
            </span>
            <span className="echart-track" aria-hidden="true">
              <span className="echart-bar" style={{ height: `${b.height}%` }} />
            </span>
            <span className="echart-mon" aria-hidden="true">
              {b.short}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** The trader's Pro offer (components/provider/ProOffer.tsx), until Pro is on. Not shown to the admin. */
function ProOfferSlot({ admin, offer, isPro }: { admin: boolean; offer: React.ReactNode; isPro: boolean }) {
  if (admin || isPro || !offer) return null;
  return <div className="pro-progress is-reached">{offer}</div>;
}

export function EnquiryStats({
  stats,
  id,
  admin = false,
  offer = null,
  isPro = false,
}: {
  stats: Stats;
  id: string;
  admin?: boolean;
  /** The trader's Pro offer, shown until Pro is on. */
  offer?: React.ReactNode;
  isPro?: boolean;
}) {
  const all = stats.allTime;
  return (
    <div className="enquiry-stats">
      <div className="stats-block">
        <p className="stats-label">This month</p>
        <Strip stats={stats} />
        <p className="stats-all" data-testid="stats-all-time">
          All time: {plural(all.enquiries, "enquiry", "enquiries")}
          {all.enquiries > 0 && ` (${plural(all.calls, "call", "calls")}, ${plural(all.whatsapps, "WhatsApp", "WhatsApps")})`}
        </p>
      </div>
      <Chart stats={stats} id={id} />
      <p className={admin ? "a-hint" : "stats-how"}>
        An enquiry is a tap on Call or WhatsApp on {admin ? "their" : "your"} page. Each person or phone counts once a
        day, and {admin ? "the trader's own taps and yours" : "your own taps"} don&apos;t count. Page views aren&apos;t
        counted.
      </p>
      <ProOfferSlot admin={admin} offer={offer} isPro={isPro} />
    </div>
  );
}
