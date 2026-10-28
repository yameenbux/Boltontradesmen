import { FUNNEL_LABEL, type Funnel } from "@/lib/funnel";
import { FUNNEL_STEPS } from "@/lib/page-views";

/**
 * Where traders drop off on the way to a listing: people (one per connection a day) at each step over the last 7 and
 * 30 days, then listings that went live. Your own visits aren't counted.
 */
export function SignupFunnel({ week, month }: { week: Funnel; month: Funnel }) {
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
          {FUNNEL_STEPS.map((k) => (
            <tr key={k}>
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
        </tbody>
      </table>
    </section>
  );
}
