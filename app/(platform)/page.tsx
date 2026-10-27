import { Button } from "@/components/ui/Button";
import { AskCard } from "@/components/home/AskCard";
import { Shortcuts } from "@/components/home/CategoryTile";
import { Hero } from "@/components/home/Hero";
import { NewTraders } from "@/components/home/NewTraders";
import { JsonLd } from "@/components/JsonLd";
import { homeShortcuts } from "@/lib/category-search";
import { listCategoryGroups, listNewestProviders } from "@/lib/directory";
import { homeJsonLd, pageMetadata } from "@/lib/seo";

// Categories with live-provider counts and the newest listings; cached and refreshed every 5 minutes, no cookies.
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Find trusted local trades in Bolton | Bolton Vouched",
  description:
    "Plumbers, electricians, cleaners and more across Bolton (BL1 to BL7), recommended by local people. See residents' reviews and the checks on each listing, then call or WhatsApp them. Free, no sign-up to look.",
  path: "/",
});

export default async function Home() {
  const [groups, newest] = await Promise.all([listCategoryGroups(), listNewestProviders(8)]);
  const all = groups.flatMap((g) => g.categories);
  const searchable = all.map(({ slug, name }) => ({ slug, name }));
  const tradeNames = new Map(all.map((c) => [c.slug, c.name]));

  return (
    <main className="home">
      {/* Who runs the site and its search box, for Google (the home page is the directory). */}
      <JsonLd data={homeJsonLd()} />
      <Hero categories={searchable} />

      <section className="home-block" aria-labelledby="popular-title">
        <h2 id="popular-title">Popular in Bolton</h2>
        <Shortcuts trades={homeShortcuts(groups)} total={all.length} />
      </section>

      <NewTraders providers={newest} tradeNames={tradeNames} />

      <section className="how-card reveal" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li>
            <b>Find someone</b>
            <span>Best-reviewed first</span>
          </li>
          <li>
            <b>Call or WhatsApp</b>
            <span>Direct, no sign-up</span>
          </li>
          <li>
            <b>Vouch for them</b>
            <span>A review in a minute</span>
          </li>
        </ol>
        <p>Nobody can pay to rank higher. Only real customers&apos; reviews move a trader up.</p>
      </section>

      <AskCard />

      {/* Traders are the other half of the directory: every listing is one more neighbour residents can call. */}
      <section className="trade-band reveal" aria-labelledby="trade-band-title">
        <div>
          <h2 id="trade-band-title">A Bolton trader?</h2>
          <p>Free listing, no lead fees.</p>
        </div>
        <Button href="/for-traders">List your trade</Button>
      </section>
    </main>
  );
}
