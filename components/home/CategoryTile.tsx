import Link from "next/link";
import { CategoryIcon } from "@/components/CategoryIcon";
import { platformPath } from "@/lib/paths";

export const localPros = (n: number) => `${n} local pro${n === 1 ? "" : "s"}`;

// "Most asked for" tile: icon on the left, trade name and how many live providers it has.
export function CategoryTile({ slug, name, liveCount }: { slug: string; name: string; liveCount: number }) {
  return (
    <Link href={platformPath("c", slug)} className="tile press lift">
      <span className="ic">
        <CategoryIcon slug={slug} />
      </span>
      <span className="tx">
        <b>{name}</b>
        <span>{localPros(liveCount)}</span>
      </span>
    </Link>
  );
}
