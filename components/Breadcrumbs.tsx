import Link from "next/link";
import type { Crumb } from "@/lib/seo";

const Back = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const Sep = () => (
  <svg className="sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/**
 * "‹ Trades › Plumber › Ace Plumbing" at the top of a directory page. The last crumb is the current page (not a
 * link); the first keeps the back chevron, so on a phone it still reads as the way back. One line: middle crumbs
 * shrink with an ellipsis before the first one does. `plain` renders plain `<a>` links (full page loads).
 * Pages that are indexed pair it with breadcrumbJsonLd(trail) from lib/seo.ts.
 */
export function Breadcrumbs({ trail, plain = false }: { trail: Crumb[]; plain?: boolean }) {
  const last = trail.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {trail.map((c, i) => {
          const body = (
            <>
              {i === 0 && <Back />}
              <span>{c.name}</span>
            </>
          );
          return (
            <li key={c.path}>
              {i > 0 && <Sep />}
              {i === last ? (
                <span aria-current="page" className="here">
                  <span>{c.name}</span>
                </span>
              ) : plain ? (
                <a href={c.path} className="press">
                  {body}
                </a>
              ) : (
                <Link href={c.path} className="press">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
