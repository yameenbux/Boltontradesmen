import { ARRIVAL_LABEL, FUNNEL_LABEL, type Funnel } from "@/lib/funnel";
import { HEARD_FROM, HEARD_FROM_LABEL } from "@/lib/heard-from";
import { ARRIVAL_SOURCES, FUNNEL_STEPS } from "@/lib/page-views";

/**
 * Where traders drop off on the way to a listing: people (one per connection a day) at each step over the last 7 and
 * 30 days, then listings that went live, by what the trader said brought them. Above it, people who arrived from
 * Facebook, Instagram, WhatsApp or a poster's QR code, on any page. Your own visits aren't counted.
 */
export function SignupFunnel({ week, month }: { week: Funnel; month: Funnel }) {
  const sources = [...HEARD_FROM.map((h) => h.value), "unknown" as const].filter(
    (k) => month.listedFrom[k] > 0,
  );
  return (
    <section className="a-card" aria-labelledby="funnel-title" data-testid="signup-funnel">
      <h2 id="funnel-title">Trader sign-ups</h2>
      <p className="a-lede">People at each step, one per person a day. Your own visits aren&apos;t counted.</p>
      <table className="funnel">
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">7 days</th>
            <th scope="col">30 days</th>
          </tr>
        </thead>
        <tbody>
          {ARRIVAL_SOURCES.map((k) => (
            <tr key={k} data-testid={`arrival-${k}`}>
              <th scope="row">{ARRIVAL_LABEL[k]}</th>
              <td>{week.arrivals[k]}</td>
              <td>{month.arrivals[k]}</td>
            </tr>
          ))}
          {FUNNEL_STEPS.map((k) => (
            <tr key={k} className={k === FUNNEL_STEPS[0] ? "funnel-start" : undefined}>
              <th scope="row">{FUNNEL_LABEL[k]}</th>
              <td>{week.steps[k]}</td>
              <td>{month.steps[k]}</td>
            </tr>
          ))}
          <tr className="funnel-end">
            <th scope="row">Went live</th>
            <td>{week.listed}</td>
            <td>{month.listed}</td>
          </tr>
          {sources.map((k) => (
            <tr key={k} className="funnel-from" data-testid={`listed-from-${k}`}>
              <th scope="row">{k === "unknown" ? "· didn't say where they heard" : `· heard via ${HEARD_FROM_LABEL[k]}`}</th>
              <td>{week.listedFrom[k]}</td>
              <td>{month.listedFrom[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
