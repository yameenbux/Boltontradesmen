import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAQ } from "@/components/site/content";

// Final review 2, I3: lists are ordered by the shrunk quality score, then the number of reviews, then the most
// recent review (lib/directory.ts). "Would use again" is the headline figure on a listing, but it is not what
// decides the order, so no public copy may say it is.
const ROOTS = ["app", "components", "lib", "docs/launch"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|md|mdx)$/.test(name) ? [p] : [];
  });
}

const read = (f: string) => readFileSync(f, "utf8").replace(/’/g, "'").replace(/&apos;/g, "'").replace(/\s+/g, " ");

describe("ranking copy matches the ranking", () => {
  const all = ROOTS.flatMap((r) => files(path.join(process.cwd(), r)));

  it("nothing says the order comes from 'would use again'", () => {
    const claim =
      /(rank(ed|s|ing)?|order(ed)?|sorted|come first|comes from)[^.]{0,60}(would|'d) use (them|someone|the provider)? ?again|use (them )?again[^.]{0,30}come first/i;
    const hits = all.filter((f) => claim.test(read(f))).map((f) => path.relative(process.cwd(), f));
    expect(hits).toEqual([]);
  });

  it("the FAQ explains the ranking in plain words", () => {
    const answer = FAQ.find((f) => f.q === "How are people ranked?");
    const text = JSON.stringify(answer?.a);
    expect(text).toContain("quality of the work");
    expect(text).toContain("a couple of reviews can't put anyone on top");
  });

  it("How ratings work states the order precisely", () => {
    const page = read(path.join(process.cwd(), "app/(info)/how-ratings-work/page.tsx"));
    expect(page).toContain("How lists are ordered");
    expect(page).toContain(
      "highest quality score first. If two have the same score, the one with more reviews comes first, then the one with the most recent review.",
    );
    expect(page).toContain("don't decide the order");
  });
});
