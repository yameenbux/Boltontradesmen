import { Scene } from "@/components/art/Scene";
import { Greeting } from "@/components/home/Greeting";
import { HomeSearch } from "@/components/home/HomeSearch";

// The home page's opening scene: Bolton at dusk behind the headline and the search. The search is usable at once;
// the skyline draws itself in around it.
export function Hero({ categories }: { categories: { slug: string; name: string }[] }) {
  return (
    <Scene className="hero" labelledBy="hero-title">
      <Greeting />
      <h1 id="hero-title">Trades your neighbours vouch for.</h1>
      <HomeSearch categories={categories} />
    </Scene>
  );
}
