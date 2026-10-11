import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECK, FAQ, matchesFaq, shotSrc } from "@/components/site/content";

const byQ = (q: string) => FAQ.find((f) => f.q === q)!;

describe("FAQ search", () => {
  it("matches every question on an empty or blank query", () => {
    expect(FAQ.every((f) => matchesFaq(f, ""))).toBe(true);
    expect(FAQ.every((f) => matchesFaq(f, "   "))).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(matchesFaq(byQ("Can a trader pay to rank higher?"), "  PAY ")).toBe(true);
    expect(matchesFaq(byQ("Who runs Bolton Vouched?"), "  PAY ")).toBe(false);
  });

  it("searches the answers as well as the questions", () => {
    expect(matchesFaq(byQ("Where does my information go?"), "cookies")).toBe(true);
    expect(matchesFaq(byQ("Who runs Bolton Vouched?"), "16022339")).toBe(true);
  });

  it("needs every word to match", () => {
    expect(matchesFaq(byQ("How do I get listed?"), "listed email")).toBe(true);
    expect(matchesFaq(byQ("How do I get listed?"), "listed zzqxj")).toBe(false);
  });

  it("finds nothing for nonsense", () => {
    expect(FAQ.some((f) => matchesFaq(f, "zzqxj"))).toBe(false);
  });
});

describe("card deck", () => {
  it("has seven cards, each with a committed screenshot", () => {
    expect(DECK).toHaveLength(7);
    for (const card of DECK) {
      expect(existsSync(path.join(__dirname, "..", "..", "public", shotSrc(card.shot))), card.shot).toBe(true);
    }
  });
});
