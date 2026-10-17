import { HomeSearch } from "@/components/home/HomeSearch";

// Calm editorial hero on the page background: serif headline, one line of reassurance and the search.
export function Hero({ categories }: { categories: { slug: string; name: string }[] }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <h1 id="hero-title">Trades your neighbours vouch for.</h1>
      <p>Plumbers, electricians, cleaners and more across Bolton, BL1 to BL7. Free to look, <span className="whitespace-nowrap">no sign-up.</span></p>
      <HomeSearch categories={categories} />
    </section>
  );
}
