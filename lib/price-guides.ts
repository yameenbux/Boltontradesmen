// Bolton price guides: "How much does a plumber cost in Bolton?", answered only from what reviewers told us.
// Pure and client-safe (no server imports) so it can be unit tested; lib/price-guides-public.ts reads the data.
//
// Honesty rules (consumer protection): a guide shows only the four price bands residents picked for the whole job,
// how many picked each, and the share who said the final price matched the quote. No averages, no hourly rates, no
// national figures, and nothing per district or per trader.
import type { ValueBand } from "@/lib/review-text";

/**
 * A trade needs this many counted reviews (published or under a quick check) before its guide is published. The
 * database decides (public.price_guide_public reads settings.price_guide_min_reviews, never below 10); this is the
 * same number, checked against the migration in tests/unit/price-guides.test.ts, and applied again when reading.
 */
export const PRICE_GUIDE_MIN_REVIEWS = 10;

export const PRICE_BANDS: ValueBand[] = ["<250", "250-1k", "1k-5k", "5k+"];

export const PRICE_BAND_LABELS: Record<ValueBand, string> = {
  "<250": "Under £250",
  "250-1k": "£250–£1,000",
  "1k-5k": "£1,000–£5,000",
  "5k+": "Over £5,000",
};

export const PRICE_GUIDE_NOTE =
  "Prices vary with the size of the job. These are totals for whole jobs, not hourly rates. Always get a quote.";

export type PriceGuide = {
  slug: string;
  name: string;
  groupSlug: string;
  groupName: string;
  reviewCount: number;
  bands: Record<ValueBand, number>;
  /** Whole per cent who said the final price matched the quote (rounded by the database). */
  onPricePct: number;
  /** First day of the month, "YYYY-MM-DD". */
  earliestJobMonth: string;
  latestJobMonth: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A price_guide_public row; null when it isn't a publishable guide (too few reviews, or the counts don't add up). */
export function toPriceGuide(r: any): PriceGuide | null {
  const bands: Record<ValueBand, number> = {
    "<250": Number(r.band_under_250 ?? 0),
    "250-1k": Number(r.band_250_1k ?? 0),
    "1k-5k": Number(r.band_1k_5k ?? 0),
    "5k+": Number(r.band_over_5k ?? 0),
  };
  const reviewCount = Number(r.review_count ?? 0);
  const sum = PRICE_BANDS.reduce((n, b) => n + bands[b], 0);
  if (reviewCount < PRICE_GUIDE_MIN_REVIEWS || sum !== reviewCount) return null;
  return {
    slug: r.category_slug,
    name: r.category_name,
    groupSlug: r.group_slug,
    groupName: r.group_name,
    reviewCount,
    bands,
    onPricePct: Number(r.on_price_pct ?? 0),
    earliestJobMonth: r.earliest_job_month,
    latestJobMonth: r.latest_job_month,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Whole per cent of `part` in `total` (half up); 0 when there's nothing to count. */
export function percent(part: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.round((100 * part) / total);
}

/** The band (or bands, when tied) most reviewers picked. */
export function mostCommonBands(bands: Record<ValueBand, number>): ValueBand[] {
  const top = Math.max(...PRICE_BANDS.map((b) => bands[b]));
  if (!(top > 0)) return [];
  return PRICE_BANDS.filter((b) => bands[b] === top);
}

/** "Under £250", "Under £250 and £250–£1,000", "A, B and C". */
export function joinBands(bands: ValueBand[]): string {
  const labels = bands.map((b) => PRICE_BAND_LABELS[b]);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "March 2025" from "2025-03-01". */
export function formatJobMonth(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// How each trade reads in a sentence: `one` after "How much does … cost", `many` after "See … in Bolton".
const TRADE_WORDS: Record<string, { one: string; many: string }> = {
  plumber: { one: "a plumber", many: "plumbers" },
  electrician: { one: "an electrician", many: "electricians" },
  "gas-boilers": { one: "a gas engineer", many: "gas engineers" },
  joiner: { one: "a joiner", many: "joiners" },
  plasterer: { one: "a plasterer", many: "plasterers" },
  "painter-decorator": { one: "a painter and decorator", many: "painters and decorators" },
  roofer: { one: "a roofer", many: "roofers" },
  handyman: { one: "a handyman", many: "handymen" },
  tiler: { one: "a tiler", many: "tilers" },
  locksmith: { one: "a locksmith", many: "locksmiths" },
  gardener: { one: "a gardener", many: "gardeners" },
  cleaner: { one: "a cleaner", many: "cleaners" },
  bricklayer: { one: "a bricklayer", many: "bricklayers" },
  "pest-control": { one: "pest control", many: "pest controllers" },
  "ev-solar": { one: "an EV charger or solar install", many: "EV charger and solar installers" },
  carpets: { one: "carpet fitting", many: "carpet fitters" },
  "gutter-cleaning": { one: "gutter cleaning", many: "gutter cleaners" },
  "kitchen-fitter": { one: "a kitchen fitter", many: "kitchen fitters" },
  "cctv-security": { one: "a CCTV or alarm install", many: "CCTV and alarm installers" },
  "bedrooms-wardrobes": { one: "fitted wardrobes", many: "fitted bedroom firms" },
  "window-cleaner": { one: "a window cleaner", many: "window cleaners" },
  "bathroom-fitter": { one: "a bathroom fitter", many: "bathroom fitters" },
  "driveways-paving": { one: "a new driveway or patio", many: "driveway and paving firms" },
  "appliance-repair": { one: "an appliance repair", many: "appliance repairers" },
  "heating-repair": { one: "a heating repair", many: "heating engineers" },
  "phone-computer-repair": { one: "a phone or computer repair", many: "phone and computer repairers" },
  "window-door-repair": { one: "window, door or glazing work", many: "window, door and glazing firms" },
  "rubbish-removal": { one: "rubbish removal", many: "rubbish removal firms" },
  "man-and-van": { one: "a man and van", many: "man and van firms" },
  "skip-hire": { one: "skip hire", many: "skip hire firms" },
  "house-clearance": { one: "a house clearance", many: "house clearance firms" },
  "estate-agents": { one: "an estate agent", many: "estate agents" },
  accountants: { one: "an accountant", many: "accountants" },
  "travel-agents": { one: "a travel agent", many: "travel agents" },
  caterer: { one: "a caterer", many: "caterers" },
  "bouncy-castles": { one: "bouncy castle hire", many: "bouncy castle hire firms" },
  dj: { one: "a DJ", many: "DJs" },
  cakes: { one: "a celebration cake", many: "cake makers" },
  decor: { one: "a wedding stage or event decor", many: "stage and event decorators" },
  "event-hire": { one: "event hire", many: "event hire firms" },
  photographer: { one: "a photographer", many: "photographers" },
  entertainer: { one: "an entertainer", many: "entertainers" },
  florist: { one: "a florist", many: "florists" },
  venues: { one: "a wedding or event venue", many: "wedding and event venues" },
  "mobile-hair-beauty": { one: "mobile hair and beauty", many: "mobile hair and beauty pros" },
  tutors: { one: "a tutor", many: "tutors" },
  "driving-instructors": { one: "a driving instructor", many: "driving instructors" },
  fitness: { one: "a personal trainer", many: "personal trainers" },
  "music-lessons": { one: "a music teacher", many: "music teachers" },
  "dog-walking-grooming": { one: "a dog walker or groomer", many: "dog walkers and groomers" },
  mechanic: { one: "a car service or repair", many: "mechanics and garages" },
  valeting: { one: "car valeting", many: "valeters" },
  mot: { one: "an MOT", many: "MOT garages" },
  "mobile-tyre-fitting": { one: "mobile tyre fitting", many: "mobile tyre fitters" },
  "window-tinting": { one: "window tinting", many: "window tinters" },
  "vehicle-recovery": { one: "vehicle recovery", many: "recovery firms" },
  builders: { one: "a builder", many: "builders" },
  "building-surveyors": { one: "a building survey", many: "building surveyors" },
  "air-conditioning": { one: "air conditioning", many: "air conditioning engineers" },
  "venetian-plaster": { one: "Venetian plastering", many: "Venetian plasterers" },
  "taxi-private-hire": { one: "a taxi", many: "taxis and private hire" },
  "minibus-hire": { one: "minibus hire", many: "minibus hire firms" },
  "airport-transfers": { one: "an airport transfer", many: "airport transfer drivers" },
};

/** Words for a trade added later by the admin: "a window cleaner" / "window cleaners" from its name. */
export function tradeWords(slug: string, name: string): { one: string; many: string } {
  const known = TRADE_WORDS[slug];
  if (known) return known;
  const lower = tradeLower(name.trim()).replace(/\s*&\s*/g, " and ");
  if (lower.endsWith("s")) return { one: lower, many: lower };
  return { one: `${/^[aeiou]/.test(lower) ? "an" : "a"} ${lower}`, many: `${lower}s` };
}

/** The guide's question, which is also its h1 and (with the site name) its title. */
export function guideQuestion(g: Pick<PriceGuide, "slug" | "name">): string {
  return `How much does ${tradeWords(g.slug, g.name).one} cost in Bolton?`;
}

/** "man & van", "DJ", "MOT": lower case, except words written in capitals. */
export function tradeLower(name: string): string {
  return name
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}

/** "From 10 reviews of man & van jobs since March 2025": what the numbers are. */
export function guideSource(g: Pick<PriceGuide, "name" | "reviewCount" | "earliestJobMonth">): string {
  return `from ${reviews(g.reviewCount)} of ${tradeLower(g.name)} jobs since ${formatJobMonth(g.earliestJobMonth)}`;
}

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

/** The meta description: only what the data says, the source first (search results cut it at about 160). */
export function guideDescription(g: PriceGuide): string {
  const top = mostCommonBands(g.bands);
  return `What Bolton residents paid, ${guideSource(g)}. ${g.onPricePct}% said the price matched the quote. Most often: ${joinBands(top)}.`;
}
