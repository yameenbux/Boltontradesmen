// Words and data for the showcase site at "/". Kept in one place so the owner can change wording without touching layout.
import { platformPath } from "@/lib/paths";

export const CONTACT_EMAIL = "yameen@ysbdesigns.uk";
export const MAILTO = `mailto:${CONTACT_EMAIL}`;
export const COMPANY_LINE =
  "Bolton Vouched is operated by YSB Ventures Ltd, registered in England and Wales, company number 16022339.";
export const PLATFORM = platformPath();

export const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "inside", label: "Inside" },
  { id: "traders", label: "For traders" },
  { id: "support", label: "Support" },
] as const;

// Screenshots made by scripts/shots.mjs (390x844 at 2x).
export const SHOT = { width: 780, height: 1688 } as const;
export type ShotName =
  | "home"
  | "home-howto"
  | "category"
  | "category-area"
  | "profile"
  | "profile-checks"
  | "profile-contact"
  | "ratings"
  | "consent";
export const shotSrc = (name: ShotName) => `/shots/${name}.webp`;

export type DeckCard = {
  shot: ShotName;
  alt: string;
  crop: "top" | "bottom";
  tone: "brick" | "gold" | "sage" | "ink";
  soon?: boolean;
  title: string;
  text: string;
};

export const DECK: DeckCard[] = [
  {
    shot: "home",
    alt: "Sample listing: the Bolton Vouched home screen with a search box and the most asked-for trades",
    crop: "top",
    tone: "brick",
    title: "Find by trade",
    text: "Type what you need, or tap one of the trades Bolton asks for most. Plumbers to bouncy castles.",
  },
  {
    shot: "category-area",
    alt: "Sample listing: a list of plumbers filtered to the BL3 area",
    crop: "top",
    tone: "gold",
    title: "Just your area",
    text: "Tap BL1 to BL7 and the list keeps only the people who cover your patch.",
  },
  {
    shot: "profile",
    alt: "Sample listing: a plumber's profile with made-up review figures",
    crop: "top",
    tone: "sage",
    title: "Would they use them again?",
    text: "Once reviews open, profiles lead with one honest number, with on time, on price and quality of work underneath.",
  },
  {
    shot: "profile-checks",
    alt: "Sample listing: the 'What we've checked' card: ID checked and public liability insurance, with the month checked",
    crop: "top",
    tone: "ink",
    title: "What we've checked",
    text: "ID and insurance checks are shown with the month we checked them. Nothing is claimed that wasn't checked.",
  },
  {
    shot: "profile-contact",
    alt: "Sample listing: an electrician's profile with Call and WhatsApp buttons along the bottom",
    crop: "bottom",
    tone: "brick",
    title: "Call or WhatsApp in one tap",
    text: "Straight from their page. No sign-up, no forms, no middleman taking a cut.",
  },
  {
    shot: "ratings",
    alt: "The How ratings work page",
    crop: "top",
    tone: "gold",
    title: "Fair ranking",
    text: "Nobody can pay to rank higher. Once reviews open, nobody gets a score until they have three, so a lucky one can't put anyone on top.",
  },
  {
    shot: "home-howto",
    alt: "How it works, with step three: reviews are coming soon",
    crop: "top",
    tone: "sage",
    soon: true,
    title: "Reviews, coming soon",
    text: "Soon you'll vouch for the people you've used, in a minute, so the next person in Bolton knows.",
  },
];

// FAQ answers are paragraphs of plain text and links, so the search can match on the exact words shown.
export type Segment = string | { href: string; label: string };
export type Faq = { q: string; a: Segment[][] };

export const FAQ: Faq[] = [
  {
    q: "Is it free?",
    a: [["Yes. Free to use, with no sign-up and nothing to download."], ["It's free for traders to be listed, too."]],
  },
  {
    q: "How are people ranked?",
    a: [
      [
        "Reviews are coming soon, so for now everyone is listed as new. Once reviews open, people will be ranked by how many reviewers said they'd use them again. Nobody gets a score until they have three reviews, newer reviews will count for more, and a handful of reviews can't put anyone on top. Nobody can pay to move up.",
      ],
      ["The full detail is on ", { href: "/how-ratings-work", label: "how ratings work" }, "."],
    ],
  },
  {
    q: "How do I get listed?",
    a: [
      ["Message Yameen in the group, or email ", { href: MAILTO, label: CONTACT_EMAIL }, "."],
      [
        "You'll get a link showing exactly how your listing will look. Nothing goes live until you've read it and tapped to agree.",
      ],
    ],
  },
  {
    q: "How do I come off it?",
    a: [
      [
        "Tell us and you're removed within one working day, no reason needed. Message Yameen or email ",
        { href: MAILTO, label: CONTACT_EMAIL },
        ".",
      ],
    ],
  },
  {
    q: "Can a trader pay to rank higher?",
    a: [
      [
        "No. Payment never affects ranking. Nobody can pay to be placed higher, or to have a review changed or removed.",
      ],
    ],
  },
  {
    q: "Who runs Bolton Vouched?",
    a: [
      [
        "Yameen, through his company YSB Ventures Ltd, registered in England and Wales, company number 16022339. It started from the same question everyone asks in the group: anyone know a good…?",
      ],
    ],
  },
  {
    q: "How do I report a problem or a review?",
    a: [
      [
        "Email ",
        { href: MAILTO, label: CONTACT_EMAIL },
        " and say which page it's on and what's wrong. Every report is looked at.",
      ],
    ],
  },
  {
    q: "Where does my information go?",
    a: [
      [
        "If you're just looking: no account, and no cookies. When you tap Call or WhatsApp we count the tap against that trader with a scrambled signature of your device (a one-way hash), not your IP address or phone number.",
      ],
      [
        "Traders' phone numbers are kept private, behind the buttons. Our database is hosted in London, UK. The ",
        { href: "/privacy", label: "privacy notice" },
        " has the full detail.",
      ],
    ],
  },
];

export const segmentText = (s: Segment) => (typeof s === "string" ? s : s.label);
export const faqText = (f: Faq) => [f.q, ...f.a.flat().map(segmentText)].join(" ");

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// FAQ search: every word typed must appear in the question or its answer (case and extra spaces ignored).
export function matchesFaq(item: Faq, query: string): boolean {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const text = norm(faqText(item));
  return words.every((w) => text.includes(w));
}
