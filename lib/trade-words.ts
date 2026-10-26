// Picks the trade a question is about from its words, for the Ask form ("fix my boiler" -> Gas & boilers).
// A fixed list rather than a guess: every match is predictable and tested, and a job that needs a registered trade
// (a gas boiler needs a Gas Safe engineer) never lands on one that can't legally do it.

type Named = { slug: string; name: string };

/** Words people use for a job, by category slug. Whole words only; plurals are handled in `words`. */
const WORDS: Record<string, readonly string[]> = {
  "gas-boilers": ["boiler", "combi", "gas", "hob", "gas safe", "gas engineer", "gas fire"],
  "heating-repair": ["radiator", "heating", "central heating", "underfloor"],
  plumber: ["plumber", "plumbing", "leak", "leaking", "tap", "toilet", "sink", "pipe", "drain", "blocked", "shower", "bath", "cistern"],
  electrician: ["electrician", "sparky", "electrics", "electrical", "socket", "fuse", "fuse box", "consumer unit", "wiring", "rewire", "light fitting"],
  joiner: ["joiner", "carpenter", "joinery", "skirting", "worktop"],
  plasterer: ["plasterer", "plasterers", "plaster", "plastering", "skim", "rendering", "render"],
  "venetian-plaster": ["venetian plaster", "venetian plastering", "venetian", "polished plaster", "decorative plaster", "marmorino", "tadelakt", "microcement"],
  "painter-decorator": ["painter", "decorator", "decorating", "painting", "wallpaper"],
  roofer: ["roofer", "roofers", "roof", "roofing", "gutter", "guttering", "slates", "chimney", "flat roof"],
  handyman: ["handyman", "odd jobs", "flat pack", "flatpack", "shelves", "curtain"],
  tiler: ["tiler", "tiling", "tiles", "grout"],
  locksmith: ["locksmith", "locked out", "lock", "locks"],
  gardener: ["gardener", "garden", "gardening", "lawn", "hedge", "grass", "tree", "turf"],
  cleaner: ["cleaner", "cleaning", "end of tenancy", "deep clean", "carpet clean", "carpet cleaning", "oven clean", "house clean"],
  builders: ["builder", "building work", "extension", "house extension", "kitchen extension", "loft conversion", "garage conversion", "renovation", "refurbishment", "refurb", "new build", "structural", "knock through", "steel beam", "rsj"],
  "air-conditioning": ["air conditioning", "air con", "aircon", "air conditioner", "ac unit", "air con unit", "split system", "air to air", "f gas", "fgas"],
  bricklayer: ["bricklayer", "bricklayers", "brick layer", "brick layers", "brickie", "brickwork", "bricks", "pointing", "repointing"],
  "ev-solar": ["ev charger", "car charger", "electric car charger", "solar", "solar panel", "battery storage", "home battery"],
  carpets: ["carpet", "carpet fitter", "carpet fitting", "flooring", "laminate", "vinyl flooring", "underlay", "lino"],
  "cctv-security": ["cctv", "security camera", "camera system", "burglar alarm", "house alarm", "alarm system", "ring doorbell", "video doorbell", "smart doorbell"],
  "kitchen-fitter": ["kitchen fitter", "kitchen fitting", "fit a kitchen", "fit my kitchen", "new kitchen", "kitchen install", "kitchen installation", "kitchen refit"],
  "bedrooms-wardrobes": ["fitted wardrobe", "fitted bedroom", "sliding wardrobe", "built in wardrobe", "wardrobe fitter", "bedroom fitter", "fitted furniture"],
  "window-cleaner": ["window cleaner", "window cleaning", "clean my window", "clean the window", "windows cleaned", "window cleaned"],
  "bathroom-fitter": ["bathroom fitter", "bathroom fitting", "new bathroom", "bathroom refit", "bathroom install", "bathroom installation", "wet room", "wetroom"],
  "driveways-paving": ["driveway", "drive way", "paving", "block paving", "patio", "tarmac", "resin drive", "resin driveway", "flags", "flagging", "paver"],
  "gutter-cleaning": ["gutter cleaning", "gutter clean", "gutter cleaned", "gutter need cleaning", "gutter need clearing", "clean gutter", "clean my gutter", "clean the gutter", "clean out gutter", "clear gutter", "clear my gutter", "cleaning gutter", "blocked gutter", "gutter vac"],
  "pest-control": ["pest", "pests", "mice", "rats", "wasps", "wasp nest", "bed bugs", "ants"],
  "appliance-repair": ["washing machine", "dishwasher", "fridge", "freezer", "tumble dryer", "oven", "cooker", "appliance"],
  "phone-computer-repair": ["phone", "laptop", "computer", "iphone", "tablet"],
  "window-door-repair": ["window", "windows", "door", "doors", "double glazing", "misted", "upvc", "glazing", "glazier", "glass", "new window", "window fitter", "window fitting", "composite door", "conservatory"],
  "rubbish-removal": ["rubbish", "junk", "waste", "tip run"],
  "man-and-van": ["man and van", "van", "removals", "removal", "moving house", "move house"],
  "skip-hire": ["skip"],
  accountants: ["accountant", "accountancy", "accounts", "bookkeeper", "bookkeeping", "tax return", "self assessment", "vat return", "payroll"],
  "travel-agents": ["travel agent", "holiday", "package holiday", "flight", "cheap flight", "umrah", "hajj", "cruise"],
  "estate-agents": ["estate agent", "letting agent", "lettings", "sell my house", "selling my house", "sell our house", "house valuation", "property valuation", "rent out my house"],
  "house-clearance": ["house clearance", "clearance", "clear out"],
  caterer: ["caterer", "catering", "buffet"],
  "bouncy-castles": ["bouncy castle", "bouncy castles", "inflatable"],
  dj: ["dj"],
  cakes: ["cake", "cakes", "cupcakes"],
  decor: ["decor", "balloons", "backdrop"],
  photographer: ["photographer", "photography", "photos", "photoshoot"],
  entertainer: ["entertainer", "magician", "face painter", "clown"],
  florist: ["florist", "flowers", "bouquet"],
  venues: ["wedding venue", "venue", "venue hire", "banqueting hall", "banqueting suite", "function room", "function hall", "hall hire", "wedding hall", "events hall"],
  "mobile-hair-beauty": ["hair extensions", "lash extensions", "eyelash extensions", "nail extensions", "hairdresser", "hair", "barber", "nails", "makeup", "lashes", "beauty"],
  tutors: ["tutor", "tutoring", "tuition", "maths", "gcse", "eleven plus", "11 plus"],
  "driving-instructors": ["driving instructor", "driving lessons", "driving lesson", "learner"],
  fitness: ["personal trainer", "personal training", "pt", "fitness", "gym", "workout", "weight loss", "strength training", "boxing", "yoga", "pilates", "bootcamp"],
  "music-lessons": ["piano", "guitar", "singing", "music lessons", "drums"],
  "dog-walking-grooming": ["dog walker", "dog walking", "dog groomer", "grooming", "dog"],
  mechanic: ["mechanic", "car repair", "car air con", "car aircon", "air con regas", "aircon regas", "brakes", "clutch", "car service", "car servicing", "service my car", "full service", "interim service", "garage"],
  valeting: ["valet", "valeting", "car valet", "car valeting", "car wash", "detailing"],
  mot: ["mot", "mot test", "mot centre"],
  "vehicle-recovery": ["vehicle recovery", "car recovery", "recovery truck", "breakdown", "broken down", "tow", "towing", "tow truck", "jump start", "flat battery"],
  "window-tinting": ["window tint", "window tinting", "tinted window", "tint my window", "car tint", "privacy glass"],
  "mobile-tyre-fitting": ["tyre", "tyres", "puncture"],
  "taxi-private-hire": ["taxi", "cab", "private hire"],
  "airport-transfers": ["airport", "airport run", "airport transfer", "manchester airport"],
  "minibus-hire": ["minibus"],
};

// Lowercase words, "&" as "and", punctuation as spaces, and a trailing plural "s" dropped so "taps" finds "tap".
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

const phrase = (s: string) => ` ${words(s).join(" ")} `;

/**
 * The category a question is about, or null when its words don't name one. Only categories in `categories` count
 * (so a retired trade never comes back). The longest matching phrase wins, so "gas fire" beats "fire" and
 * "man and van" beats "van"; a tie goes to the phrase that appears first in the question.
 */
export function guessTrade<T extends Named>(text: string, categories: readonly T[]): T | null {
  const hay = phrase(text);
  if (hay.trim() === "") return null;
  let best: { cat: T; len: number; at: number } | null = null;
  for (const cat of categories) {
    // A category's own name counts too ("Plasterer", "Skip hire").
    for (const term of [...(WORDS[cat.slug] ?? []), cat.name]) {
      const needle = phrase(term);
      if (needle.trim() === "") continue;
      const at = hay.indexOf(needle);
      if (at < 0) continue;
      const len = needle.length;
      if (!best || len > best.len || (len === best.len && at < best.at)) best = { cat, len, at };
    }
  }
  return best?.cat ?? null;
}

/**
 * Whether a trade fits what someone typed in a trade search (the trader form's "Search your trade"): every typed
 * word starts a word of the trade's name or of its words, so "venet", "polished plaster" and "tow" all find theirs.
 * An empty search fits everything.
 */
export function matchesTrade(query: string, cat: Named): boolean {
  const typed = words(query);
  if (typed.length === 0) return true;
  const known = [cat.name, ...(WORDS[cat.slug] ?? [])].flatMap(words);
  return typed.every((t) => known.some((k) => k.startsWith(t)));
}
