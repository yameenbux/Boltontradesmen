import { AskCard } from "@/components/home/AskCard";
import { CategoryGroups } from "@/components/home/CategoryGroups";
import { CategoryTile } from "@/components/home/CategoryTile";
import { Hero } from "@/components/home/Hero";
import { TrustStrip } from "@/components/home/TrustStrip";
import { popularCategories } from "@/lib/category-search";
import { listCategoryGroups } from "@/lib/directory";
import { isQuestionOpen } from "@/lib/questions";
import { listRecentQuestions } from "@/lib/questions-public";
import { pageMetadata } from "@/lib/seo";

// Categories plus live-provider counts and the latest community questions; cached and refreshed every 5 minutes (and
// when a question is posted or answered), no cookies.
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Find trusted local trades in Bolton | Bolton Vouched",
  description:
    "Plumbers, electricians, cleaners and more across Bolton (BL1 to BL7), recommended by local people. See residents' reviews and the checks on each listing, then call or WhatsApp them. Free, no sign-up to look.",
  path: "/platform",
});

export default async function Home() {
  const [groups, questions] = await Promise.all([listCategoryGroups(), listRecentQuestions(10)]);
  const searchable = groups.flatMap((g) => g.categories).map(({ slug, name }) => ({ slug, name }));
  const popular = popularCategories(groups);
  // The two newest questions still open (as of this render), for the Ask Bolton card.
  const now = new Date();
  const latest = questions.filter((q) => isQuestionOpen(q.createdAt, now)).slice(0, 2);

  return (
    <main>
      <Hero categories={searchable} />
      <TrustStrip />
      <AskCard latest={latest} />

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
              <b>Find someone.</b> Pick a trade and your area. The ones whose work reviewers rate highest come first.
            </span>
          </li>
          <li>
            <span>
              <b>Call or WhatsApp them.</b> Straight from their page, no sign-up needed.
            </span>
          </li>
          <li>
            <span>
              <b>Vouch for them.</b> Leave a review in a minute, so the next person knows how it went.
            </span>
          </li>
        </ol>
      </section>
    </main>
  );
}
