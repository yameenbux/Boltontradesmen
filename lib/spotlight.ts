// A new trader's Facebook spotlight, requested by the owner: the post's text and the facts its image shows, built only
// from what the public listing says (never an accreditation, insurance or trade the listing doesn't have). The image is
// /p/<slug>/spotlight.png; the text is /p/<slug>/spotlight.txt, for the daily job that drafts the post in Metricool.
// Pure functions, so they can be unit tested.
import { checkRows, type Check } from "@/lib/checks";
import { displayLink, reviewLink } from "@/lib/review-link";
import { coverage, leadTrades, stripPhoneNumbers } from "@/lib/seo";

export type SpotlightInput = {
  slug: string;
  businessName: string;
  areas: string[];
  hasWhatsapp: boolean;
  checks: Check[];
  idChecked: boolean;
  reviewCount: number;
  /** "taking" while the trader says they're taking on work. */
  availability: "taking" | "booked" | null;
  /** The listing's trade names, as the directory shows them. */
  trades: string[];
};

export type SpotlightFacts = {
  name: string;
  /** "Heating repair · Appliance repair", or "Local trader". */
  tradeLine: string;
  /** The ticked lines, in order: checks, areas, availability, contact. */
  lines: string[];
};

/**
 * A name typed all in capitals ("A A HEATING ENGINEER") in title case for the spotlight, where capitals in the display
 * face read as shouting and crowd together. Short all-caps words stay as typed ("URM", "JB"), as do names with any
 * lower case.
 */
export function calmCaps(name: string): string {
  if (/[a-z]/.test(name) || !/[A-Z]{4}/.test(name)) return name;
  return name.replace(/[A-Z]+/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()));
}

// The best-known place in each district, for the words people search on Facebook ("electrician Farnworth").
const PLACES: Record<string, string> = {
  BL1: "Bolton",
  BL2: "Breightmet",
  BL3: "Little Lever",
  BL4: "Farnworth",
  BL5: "Westhoughton",
  BL6: "Horwich",
  BL7: "Bromley Cross",
  M26: "Radcliffe",
  M28: "Walkden",
  M46: "Atherton",
  WN2: "Hindley",
};

/** "Bolton, Farnworth, Horwich and Westhoughton": Bolton first, then up to five more places the listing covers. */
export function placesPhrase(areas: string[]): string {
  const places = ["Bolton", ...areas.map((a) => PLACES[a]).filter((p): p is string => !!p && p !== "Bolton")].slice(0, 6);
  return places.length === 1 ? places[0] : `${places.slice(0, -1).join(", ")} and ${places.at(-1)}`;
}

/** "#Bolton #BoltonElectrician #BoltonVouched #SupportLocal": the town, up to two trades, the brand. */
export function spotlightHashtags(trades: string[], businessName: string): string {
  const camel = (t: string) =>
    t
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  const tags = ["#Bolton", ...leadTrades(trades, businessName).map((t) => `#Bolton${camel(t)}`), "#BoltonVouched", "#SupportLocal"];
  return [...new Set(tags)].join(" ");
}

/** The facts the image shows and the post repeats. */
export function spotlightFacts(p: SpotlightInput): SpotlightFacts {
  const name = calmCaps(stripPhoneNumbers(p.businessName.replace(/\s+/g, " ").trim()));
  const lead = leadTrades(p.trades, p.businessName);
  const lines: string[] = [];
  // Only checks the admin recorded (never the "None provided" dash row), at most two so the rest still fit.
  lines.push(...checkRows(p.checks, p.idChecked).filter((r) => r.ok && r.kind !== "id").slice(0, 2).map((r) => r.title));
  if (p.areas.length) lines.push(`Covers ${coverage(p.areas)}`);
  if (p.reviewCount > 0) lines.push(`${p.reviewCount} review${p.reviewCount === 1 ? "" : "s"} from local customers`);
  if (p.availability === "taking") lines.push("Taking on work now");
  lines.push(p.hasWhatsapp ? "Call or WhatsApp them direct" : "Call them direct");
  return { name, tradeLine: lead.length ? lead.join(" · ") : "Local trader", lines };
}

/** The post: who they are, the facts, their page, the review link, and the free listing for other traders. */
export function spotlightText(p: SpotlightInput, base: string): string {
  const f = spotlightFacts(p);
  const site = displayLink(base);
  const lead = leadTrades(p.trades, p.businessName);
  // The searched words first: "Heating repair or appliance repair in Bolton, Breightmet ...?"
  const what = lead.length ? lead.map((t, i) => (i === 0 ? t : t.toLowerCase())).join(" or ") : "A local trader";
  return [
    `🛠️ Trader spotlight: ${f.name}`,
    "",
    `${what} in ${placesPhrase(p.areas)}? Meet ${f.name}, listed on Bolton Vouched.`,
    "",
    ...f.lines.map((l) => `✅ ${l}`),
    "",
    `👉 ${site}/p/${p.slug}`,
    "",
    "Had work done by them? Leave an honest review so your neighbours know who to trust:",
    displayLink(reviewLink(p.slug, base)),
    "",
    `Bolton trader? Get listed free: ${site}/for-traders`,
    "",
    spotlightHashtags(p.trades, p.businessName),
  ].join("\n");
}
