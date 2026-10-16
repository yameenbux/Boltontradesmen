import { chartBars, plural, proProgress, type EnquiryStats as Stats } from "@/lib/enquiries";

// The trader's dashboard numbers (and the admin's copy of them): a "This month" strip, all time, six months of
// enquiries as bars, and progress towards the Pro offer. Server-rendered; every number is in the text, so the bars
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

/** "3 of 5 enquiries", then a quiet "Pro is coming soon" once reached. No checkout yet. */
export function ProProgress({ allTime, admin = false }: { allTime: number; admin?: boolean }) {
  const p = proProgress(allTime);
  if (admin) {
    return (
      <p className="a-hint" data-testid="pro-progress">
        Upgrade progress: {p.count} of {p.of} enquiries{p.reached ? " (reached; Pro isn't built yet, so nothing is offered)" : ""}.
      </p>
    );
  }
  return (
    <div className={`pro-progress${p.reached ? " is-reached" : ""}`} data-testid="pro-progress">
      <p className="pro-head">
        <b>Upgrade progress</b>
        <span>
          {p.count} of {p.of} enquiries
        </span>
      </p>
      <div
        className="pro-meter"
        role="progressbar"
        aria-label="Upgrade progress"
        aria-valuemin={0}
        aria-valuemax={p.of}
        aria-valuenow={p.count}
        aria-valuetext={`${p.count} of ${p.of} enquiries`}
      >
        <span style={{ width: `${p.percent}%` }} />
      </div>
      {p.reached ? (
        <div className="pro-card" data-testid="pro-soon">
          <p className="pro-title">You&apos;ve reached {p.of} enquiries — Pro unlocks soon</p>
          <p>
            Pro will add an ID check, up to 6 work photos and a monthly enquiry report, for £10 a month or £100 a year.
            It never changes where you&apos;re listed or your badges, and your listing stays free either way. It&apos;ll
            show here when it&apos;s ready.
          </p>
        </div>
      ) : (
        <p className="pro-note">
          Pro is coming soon for traders who&apos;ve had {p.of} enquiries through Bolton Vouched. Your listing stays
          free either way.
        </p>
      )}
    </div>
  );
}

export function EnquiryStats({ stats, id, admin = false }: { stats: Stats; id: string; admin?: boolean }) {
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
      <ProProgress allTime={all.enquiries} admin={admin} />
    </div>
  );
}
