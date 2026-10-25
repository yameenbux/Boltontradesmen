import { describe, it, expect } from "vitest";
import { guessTrade, matchesTrade } from "@/lib/trade-words";
import { ASK_MATCH_LIMIT, askMatches } from "@/lib/ask-matches";
import type { PublicProvider } from "@/lib/directory";

const cat = (slug: string, name: string) => ({ slug, name });

const cats = [
  cat("plumber", "Plumber"),
  cat("electrician", "Electrician"),
  cat("gas-boilers", "Gas & boilers"),
  cat("window-tinting", "Window tinting"),
  cat("venetian-plaster", "Venetian plaster"),
  cat("vehicle-recovery", "Vehicle recovery"),
  cat("cctv-security", "CCTV & security"),
  cat("venues", "Wedding & event venues"),
  cat("mechanic", "Mechanic & car servicing"),
  cat("heating-repair", "Heating repair"),
  cat("plasterer", "Plasterer"),
  cat("rubbish-removal", "Rubbish removal"),
  cat("man-and-van", "Man & van"),
  cat("cleaner", "Cleaning services"),
  cat("roofer", "Roofer"),
  cat("bricklayer", "Bricklayer"),
  cat("ev-solar", "EV chargers & solar"),
  cat("carpets", "Carpets"),
  cat("gutter-cleaning", "Gutter cleaning"),
  cat("kitchen-fitter", "Kitchen fitter"),
  cat("joiner", "Joiner"),
  cat("bedrooms-wardrobes", "Fitted bedrooms & wardrobes"),
  cat("window-cleaner", "Window cleaner"),
  cat("bathroom-fitter", "Bathroom fitter"),
  cat("driveways-paving", "Driveways & paving"),
  cat("window-door-repair", "Windows, doors & glazing"),
  cat("handyman", "Handyman"),
  cat("valeting", "Car valeting"),
  cat("estate-agents", "Estate agents"),
  cat("accountants", "Accountants"),
  cat("travel-agents", "Travel agents"),
  cat("airport-transfers", "Airport transfers"),
  cat("gas-boilers", "Gas & boilers"),
  cat("appliance-repair", "Appliance repair"),
  cat("skip-hire", "Skip hire"),
  cat("mot", "MOT test"),
  cat("taxi-private-hire", "Taxi & private hire"),
];

const guess = (text: string) => guessTrade(text, cats)?.slug ?? null;

describe("guessTrade", () => {
  it("sends the newer trades to their own categories, and keeps neighbouring jobs where they were", () => {
    expect(guess("Who fits EV chargers in Bolton?")).toBe("ev-solar");
    expect(guess("Thinking of getting solar panels fitted")).toBe("ev-solar");
    expect(guess("Need new carpets for the stairs")).toBe("carpets");
    expect(guess("Anyone do carpet cleaning?")).toBe("cleaner");
    expect(guess("Gutters need cleaning out")).toBe("gutter-cleaning");
    expect(guess("Need my gutters cleaned")).toBe("gutter-cleaning");
    expect(guess("Gutter has come away from the wall")).toBe("roofer");
    expect(guess("Looking for someone to fit a new kitchen")).toBe("kitchen-fitter");
    expect(guess("Need a joiner for some skirting")).toBe("joiner");
    expect(guess("Who does fitted wardrobes?")).toBe("bedrooms-wardrobes");
    expect(guess("Need someone to build a flat pack wardrobe")).toBe("handyman");
    expect(guess("Looking for a regular window cleaner in BL1")).toBe("window-cleaner");
    expect(guess("Misted window needs replacing")).toBe("window-door-repair");
    expect(guess("New windows and a composite door")).toBe("window-door-repair");
    expect(guess("Anyone recommend a bathroom fitter?")).toBe("bathroom-fitter");
    expect(guess("Shower is leaking")).toBe("plumber");
    expect(guess("Want a block paving driveway")).toBe("driveways-paving");
    expect(guess("Car valet needed this weekend")).toBe("valeting");
    expect(guess("Looking to sell my house, any good estate agents?")).toBe("estate-agents");
    expect(guess("Need a man and van, moving house next week")).toBe("man-and-van");
    expect(guess("My landlord won't fix the boiler")).toBe("gas-boilers");
    expect(guess("Need someone to do my self assessment tax return")).toBe("accountants");
    expect(guess("Anyone know a good travel agent for Umrah?")).toBe("travel-agents");
    expect(guess("Need a lift to the airport for my holiday")).toBe("airport-transfers");
    expect(guess("Who does window tinting on cars?")).toBe("window-tinting");
    expect(guess("Need CCTV fitted at the front of the house")).toBe("cctv-security");
    expect(guess("Looking for a wedding venue for 300 guests")).toBe("venues");
    expect(guess("Anyone do Venetian plaster in a bathroom?")).toBe("venetian-plaster");
    expect(guess("Need my wall plastered before I paint")).not.toBe("venetian-plaster");
    expect(guess("Car's broken down on the M61, need a tow")).toBe("vehicle-recovery");
    expect(guess("Any good roofers in Bolton?")).toBe("roofer");
    expect(guess("Need brick layers for a garden wall")).toBe("bricklayer");
    expect(guess("Car needs a full service")).toBe("mechanic");
    expect(guess("MOT due next week")).toBe("mot");
  });

  it("sends a boiler to gas engineers, never to a plumber", () => {
    expect(guess("Does anyone know someone that can fix a boiler?")).toBe("gas-boilers");
    expect(guess("Combi boiler keeps losing pressure, BL3")).toBe("gas-boilers");
  });

  it("reads everyday words for the job", () => {
    expect(guess("Kitchen tap is leaking")).toBe("plumber");
    expect(guess("Need two sockets moving")).toBe("electrician");
    expect(guess("Radiators cold at the top")).toBe("heating-repair");
    expect(guess("anyone do an MOT near Farnworth")).toBe("mot");
    expect(guess("Need a taxi to the station")).toBe("taxi-private-hire");
  });

  it("matches a category's own name, plurals included", () => {
    expect(guess("Recommend a good plasterer?")).toBe("plasterer");
    expect(guess("any electricians about")).toBe("electrician");
    expect(guess("cheap skip hire")).toBe("skip-hire");
  });

  it("prefers the longest phrase", () => {
    expect(guess("Looking for a man and van on Saturday")).toBe("man-and-van");
    expect(guess("rubbish removal from the garden")).toBe("rubbish-removal");
    expect(guess("oven clean before we move out")).toBe("cleaner");
    expect(guess("oven stopped heating up")).not.toBe("cleaner");
  });

  it("matches whole words only", () => {
    // "tap" is not in "taped", "gas" is not in "Vegas", "mot" is not in "motorbike".
    expect(guess("I taped the box up for Vegas on my motorbike")).toBeNull();
  });

  it("returns null when nothing names a trade, and ignores retired trades", () => {
    expect(guess("Who's good round here?")).toBeNull();
    expect(guess("")).toBeNull();
    expect(guessTrade("fix my boiler", [cat("plumber", "Plumber")])).toBeNull();
  });
});

describe("askMatches", () => {
  const p = (id: string) => ({ id }) as PublicProvider;

  it("keeps the category page order, ranked first, and cuts to the limit", () => {
    const r = askMatches({ ranked: [p("a"), p("b")], newcomers: [p("c"), p("d")] });
    expect(r.total).toBe(4);
    expect(r.top.map((x) => x.id)).toEqual(["a", "b", "c"].slice(0, ASK_MATCH_LIMIT));
  });

  it("reports none", () => {
    expect(askMatches({ ranked: [], newcomers: [] })).toEqual({ total: 0, top: [] });
  });
});

describe("matchesTrade (the trader form's trade search)", () => {
  const fits = (q: string) => cats.filter((c) => matchesTrade(q, c)).map((c) => c.slug);
  it("finds a trade by the start of its name or its words, any case", () => {
    expect(fits("venet")).toEqual(["venetian-plaster"]);
    expect(fits("Polished plaster")).toEqual(["venetian-plaster"]);
    expect(fits("sparky")).toEqual(["electrician"]);
    expect(fits("roofers")).toContain("roofer");
    expect(fits("brick layers")).toContain("bricklayer");
    expect(fits("tow")).toContain("vehicle-recovery");
  });
  it("needs every word, and an empty search fits everything", () => {
    expect(fits("plaster")).toEqual(expect.arrayContaining(["plasterer", "venetian-plaster"]));
    expect(fits("venetian roof")).toEqual([]);
    expect(fits("  ")).toHaveLength(cats.length);
  });
});
