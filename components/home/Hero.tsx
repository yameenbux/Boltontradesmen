import { HomeSearch } from "@/components/home/HomeSearch";

// Brick panel with a slowly drifting running-bond pattern (CSS ::before), headline and search.
export function Hero({ categories }: { categories: { slug: string; name: string }[] }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="eyebrow">Bolton · BL1 – BL7</div>
      <h1 id="hero-title">Who&apos;s good round here?</h1>
      <p>Plumbers, caterers, bouncy castles and more, recommended by the Bolton group.</p>
      <HomeSearch categories={categories} />
    </section>
  );
}
