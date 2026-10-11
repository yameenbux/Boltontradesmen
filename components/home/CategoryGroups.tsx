import Link from "next/link";
import { platformPath } from "@/lib/paths";

type Cat = { slug: string; name: string; liveCount: number };
type Group = { group: { slug: string; name: string }; categories: Cat[] };

// "Everything else": one native <details> per group. Categories with providers link through (with a count);
// empty ones are plain "soon" chips, not links.
export function CategoryGroups({ groups }: { groups: Group[] }) {
  return (
    <div className="groups">
      {groups.map(({ group, categories }) => {
        const live = categories.filter((c) => c.liveCount > 0).length;
        return (
          <details key={group.slug} className="group">
            <summary>
              <span>
                {group.name} <small>· {live} with pros</small>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <ul className="chips">
              {categories.map((c) => (
                <li key={c.slug}>
                  {c.liveCount > 0 ? (
                    <Link href={platformPath("c", c.slug)} className="chip press">
                      {c.name} <em>{c.liveCount}</em>
                    </Link>
                  ) : (
                    <span className="chip soon" title="Nobody listed yet">
                      {c.name} <em>soon</em>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
