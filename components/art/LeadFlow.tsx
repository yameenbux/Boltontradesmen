import type { CSSProperties, ReactNode } from "react";

// How a job reaches a trader, as three cards joined by a drawn line: found, contacted, reviewed. The words are real
// text (so screen readers, search engines and agents read the steps); the icons and the line are decorative.

const icon = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const STEP_ICONS: ReactNode[] = [
  <svg key="find" {...icon}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>,
  <svg key="call" {...icon}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
  </svg>,
  <svg key="review" {...icon}>
    <path d="m12 3 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.3 6.6 19.2l1.2-5.9L3.4 9.2l6-.7L12 3Z" />
  </svg>,
];

export function LeadFlow({ steps, label }: { steps: [string, string, string]; label: string }) {
  return (
    <ol className="flow" aria-label={label}>
      {steps.map((text, i) => (
        <li key={text} className="flow-step reveal" style={{ "--i": i } as CSSProperties}>
          <span className="flow-ic">{STEP_ICONS[i]}</span>
          <b>{text}</b>
        </li>
      ))}
    </ol>
  );
}
