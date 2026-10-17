import { checkRows, type Check } from "@/lib/checks";

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Dash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);

/** "What we've checked": a tick row per check, and a dash row when no trade accreditations were provided. */
export function ChecksList({ checks, idChecked = false }: { checks: Check[]; idChecked?: boolean }) {
  return (
    <section className="card" aria-labelledby="checks-title">
      <h2 id="checks-title">What we&apos;ve checked</h2>
      <ul className="checks">
        {checkRows(checks, idChecked).map((row, i) => (
          <li key={`${row.kind}-${i}`}>
            <span className={row.ok ? "ci" : "ci no"}>{row.ok ? <Tick /> : <Dash />}</span>
            <span>
              <b>{row.title}</b>
              <span>{row.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
