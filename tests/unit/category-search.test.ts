import { describe, it, expect } from "vitest";
import { homeShortcuts, matchCategory } from "@/lib/category-search";

const cat = (slug: string, name: string, liveCount = 0) => ({ slug, name, liveCount });

const cats = [
  cat("bouncy-castles", "Bouncy castles"),
  cat("cakes", "Cakes"),
  cat("driving-instructors", "Driving instructors"),
  cat("gas-boilers", "Gas & boilers"),
  cat("man-and-van", "Man & van"),
  cat("phone-computer-repair", "Phone & computer repair"),
  cat("plasterer", "Plasterer"),
  cat("plumber", "Plumber"),
];

describe("matchCategory", () => {
  it("trims and ignores case", () => {
    expect(matchCategory("  PLUMB ", cats)?.slug).toBe("plumber");
  });

  it("ignores accents either way", () => {
    const food = [cat("caterer", "Catering & canapés")];
    expect(matchCategory("canapes", food)?.slug).toBe("caterer");
    expect(matchCategory("canapés", food)?.slug).toBe("caterer");
  });

  it("matches a name prefix", () => {
    expect(matchCategory("cake", cats)?.slug).toBe("cakes");
    expect(matchCategory("bouncy castle", cats)?.slug).toBe("bouncy-castles");
  });

  it("prefers a prefix match over a substring match", () => {
    // "pla" is a prefix of Plasterer; it is not inside any other name.
    expect(matchCategory("pla", cats)?.slug).toBe("plasterer");
    // "computer" is only a substring.
    expect(matchCategory("computer", cats)?.slug).toBe("phone-computer-repair");
    // "boiler" is a substring of "Gas & boilers".
    expect(matchCategory("boiler", cats)?.slug).toBe("gas-boilers");
  });

  it("matches on the slug, treating spaces as hyphens", () => {
    expect(matchCategory("man and van", cats)?.slug).toBe("man-and-van");
    expect(matchCategory("gas-boilers", cats)?.slug).toBe("gas-boilers");
  });

  it("falls back to single words for the example searches", () => {
    expect(matchCategory("birthday cake", cats)?.slug).toBe("cakes");
    expect(matchCategory("boiler service", cats)?.slug).toBe("gas-boilers");
    expect(matchCategory("driving lessons", cats)?.slug).toBe("driving-instructors");
  });

  it("returns null for no match or an empty query", () => {
    expect(matchCategory("xyz", cats)).toBeNull();
    expect(matchCategory("zzz", cats)).toBeNull();
    expect(matchCategory("   ", cats)).toBeNull();
    // Short filler words alone never match.
    expect(matchCategory("the and", cats)).toBeNull();
  });
});

describe("homeShortcuts", () => {
  const groups = [
    { categories: [cat("plumber", "Plumber", 3), cat("tiler", "Tiler", 0), cat("joiner", "Joiner", 1)] },
    { categories: [cat("cakes", "Cakes", 3), cat("dj", "DJ", 1), cat("decor", "Decor", 0)] },
    { categories: [cat("mot", "MOT", 2), cat("electrician", "Electrician", 0), cat("roofer", "Roofer", 0)] },
  ];

  it("puts trades with live providers first, by count desc then name, then tops up with staples", () => {
    expect(homeShortcuts(groups).map((c) => c.slug)).toEqual([
      "cakes",
      "plumber",
      "mot",
      "dj",
      "joiner",
      "electrician",
      "roofer",
    ]);
  });

  it("never repeats a staple that already has providers", () => {
    expect(homeShortcuts(groups, 3).map((c) => c.slug)).toEqual(["cakes", "plumber", "mot"]);
    const one = [{ categories: [cat("plumber", "Plumber", 2), cat("electrician", "Electrician", 0)] }];
    expect(homeShortcuts(one).map((c) => c.slug)).toEqual(["plumber", "electrician"]);
  });

  it("limits the result (default 7)", () => {
    const many = [{ categories: Array.from({ length: 12 }, (_, i) => cat(`c${i}`, `C${i}`, 1)) }];
    expect(homeShortcuts(many)).toHaveLength(7);
  });

  it("shows the staples when nobody is live, skipping any that don't exist", () => {
    const empty = [{ categories: [cat("tiler", "Tiler", 0), cat("roofer", "Roofer", 0), cat("plumber", "Plumber", 0)] }];
    expect(homeShortcuts(empty).map((c) => c.slug)).toEqual(["plumber", "roofer"]);
  });
});
