import Link from "next/link";
import { CategoryIcon } from "@/components/CategoryIcon";

export const localPros = (n: number) => `${n} local pro${n === 1 ? "" : "s"}`;

// "Most asked for" tile: icon, trade name and how many live providers it has.
export function CategoryTile({ slug, name, liveCount }: { slug: string; name: string; liveCount: number }) {
  return (
    <Link href={`/c/${slug}`} className="tile press lift">
      <span className="ic">
        <CategoryIcon slug={slug} />
      </span>
      <b>{name}</b>
      <span>
        <i className="dot" aria-hidden="true" />
        {localPros(liveCount)}
      </span>
    </Link>
  );
}
