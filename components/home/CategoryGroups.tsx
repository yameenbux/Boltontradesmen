import Link from "next/link";
import { platformPath } from "@/lib/paths";

type Cat = { slug: string; name: string; liveCount: number };
type Group = { group: { slug: string; name: string }; categories: Cat[] };

// The All trades page: each group's trades as chips. Every chip links to its trade page (an empty one says so and
// offers Ask Bolton); a trade with live providers shows how many.
export function CategoryGroups({ groups }: { groups: Group[] }) {
  return (
    <div className="groups">
      {groups.map(({ group, categories }) => (
        <section key={group.slug} className="group" aria-labelledby={`g-${group.slug}`}>
          <h2 id={`g-${group.slug}`}>{group.name}</h2>
          <ul className="chips">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={platformPath("c", c.slug)} className={c.liveCount > 0 ? "chip press" : "chip quiet press"}>
                  {c.name} {c.liveCount > 0 && <em>{c.liveCount}</em>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
