import { CategoryGroups } from "@/components/home/CategoryGroups";
import { CategoryTile } from "@/components/home/CategoryTile";
import { Hero } from "@/components/home/Hero";
import { TrustStrip } from "@/components/home/TrustStrip";
import { popularCategories } from "@/lib/category-search";
import { listCategoryGroups } from "@/lib/directory";

// Categories plus live-provider counts only; cached and refreshed every 5 minutes, no cookies.
export const revalidate = 300;

export default async function Home() {
  const groups = await listCategoryGroups();
  const searchable = groups.flatMap((g) => g.categories).map(({ slug, name }) => ({ slug, name }));
  const popular = popularCategories(groups);

  return (
    <main>
      <Hero categories={searchable} />
      <TrustStrip />

      <div className="section-head">
        <h2>Most asked for</h2>
        <a className="link" href="#all-trades">
          All trades
        </a>
      </div>
      {popular.length > 0 ? (
        <div className="tiles stagger" data-testid="popular-tiles">
          {popular.map((c) => (
            <CategoryTile key={c.slug} slug={c.slug} name={c.name} liveCount={c.liveCount} />
          ))}
        </div>
      ) : (
        <p className="empty">We&apos;re adding Bolton&apos;s first pros now. Have a look through the trades below.</p>
      )}

      <div className="section-head" id="all-trades">
        <h2>Everything else</h2>
      </div>
      <CategoryGroups groups={groups} />

      <section className="howto" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li>
            <span>
              <b>Find someone.</b> Pick a trade and your area. Once reviews open, the ones people would use again come first.
            </span>
          </li>
          <li>
            <span>
              <b>Call or WhatsApp them.</b> Straight from their page, no sign-up needed.
            </span>
          </li>
          <li>
            <span>
              <b>Vouch for them.</b> Reviews are coming soon, so you can tell the next person how it went.
            </span>
          </li>
        </ol>
      </section>
    </main>
  );
}
