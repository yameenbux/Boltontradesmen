// Shared frame for the static policy pages: draft banner, h1, plain-text body (never HTML strings).
export const DRAFT_BANNER = "Draft — pending legal review";

export function PolicyPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="policy py-4">
      <p role="note" className="draft-note">
        {DRAFT_BANNER}
      </p>
      <h1>{title}</h1>
      <div className="policy-body">{children}</div>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2>{children}</h2>;
}

export function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
