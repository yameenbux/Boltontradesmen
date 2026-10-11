// Shared frame for the static policy pages: draft banner, h1, plain-text body (never HTML strings).
export const DRAFT_BANNER = "Draft — pending legal review";

export function PolicyPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p role="note" className="mb-4 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        {DRAFT_BANNER}
      </p>
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{title}</h1>
      <div className="space-y-4 leading-relaxed text-neutral-800">{children}</div>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-xl font-bold">{children}</h2>;
}

export function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
