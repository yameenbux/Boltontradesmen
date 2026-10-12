// Words and data for the showcase site at "/". Kept in one place so the owner can change wording without touching layout.
import { platformPath } from "@/lib/paths";

// Every question goes to the support inbox as a ticket, with a subject line so tickets can be sorted.
export const CONTACT_EMAIL = "support@ysbdesigns.uk";
export const ticket = (subject: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Bolton Vouched: ${subject}`)}`;
export const MAILTO = ticket("support request");
export const LISTING_TICKET = ticket("please list me");
export const REMOVAL_TICKET = ticket("remove my listing");
export const REPORT_TICKET = ticket("report a problem");

// The other support route: the operator's own WhatsApp (public on purpose; traders' numbers never appear on the site).
// Each link opens a chat with a message already typed, mirroring the email subjects above.
export const SUPPORT_WHATSAPP_DISPLAY = "07466 487591";
export const SUPPORT_WHATSAPP_E164 = "447466487591";
export const whatsappTicket = (text: string) => `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(text)}`;
export const WHATSAPP = whatsappTicket("Hi, I have a question about Bolton Vouched.");
export const LISTING_WHATSAPP = whatsappTicket(
  "Hi, I'd like to be listed on Bolton Vouched. Name: … Trade: … Areas: …",
);
export const REMOVAL_WHATSAPP = whatsappTicket("Hi, please remove my Bolton Vouched listing.");
export const REPORT_WHATSAPP = whatsappTicket("Hi, I'd like to report a problem on Bolton Vouched: …");

// The "Get listed" request form (the main way in for traders; the email and WhatsApp tickets above still work).
export const GET_LISTED = "/get-listed";

// The legally required company details (registered name and number), shared with the platform footer and policies.
export { COMPANY_LINE } from "@/lib/company";
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
  | "profile-reviews"
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
    text: "Profiles lead with one honest number, with on time, on price and quality of work underneath.",
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
    shot: "profile-reviews",
    alt: "Sample listing: a plumber's reviews, with Verified job and Group member badges and the plumber's reply",
    crop: "top",
    tone: "sage",
    title: "Real reviews, with replies",
    text: "Every reviewer signed in with Google or their email. Traders can reply, and a checked invoice earns a Verified job badge.",
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
    text: "Nobody can pay to rank higher. Nobody gets a score until they have three, so a lucky one can't put anyone on top.",
  },
  {
    shot: "home-howto",
    alt: "How it works, with step three: leave a review",
    crop: "top",
    tone: "sage",
    title: "Vouch for them",
    text: "Vouch for the people you've used in a minute, so the next person in Bolton knows.",
  },
];

// FAQ answers are paragraphs of plain text and links, so the search can match on the exact words shown.
// `external` links (WhatsApp) open in a new tab.
export type Segment = string | { href: string; label: string; external?: boolean };

// "… by emailing support@… or on WhatsApp at 07466 487591", with both links going to the same kind of ticket.
const ticketRoutes = (email: string, whatsapp: string, lead = "Raise"): Segment[] => [
  `${lead} a support ticket by emailing `,
  { href: email, label: CONTACT_EMAIL },
  " or on WhatsApp at ",
  { href: whatsapp, label: SUPPORT_WHATSAPP_DISPLAY, external: true },
];
export type Faq = { q: string; a: Segment[][] };

export const FAQ: Faq[] = [
  {
    q: "Is it free?",
    a: [
      [
        "Yes for residents: free to use, nothing to download, and no sign-up to look or call. You only sign in, with Google or your email, to leave a review.",
      ],
      [
        "For traders, a basic listing is free and stays free. Later we'll offer an optional paid upgrade for extra features; you'll never be removed for not taking it, and it never moves anyone up the list.",
      ],
    ],
  },
  {
    q: "How are people ranked?",
    a: [
      [
        "People are ranked by what reviewers say about the quality of the work, with a fair adjustment so a couple of reviews can't put anyone on top. Nobody gets a score until they have three reviews, and newer reviews count for more. Nobody can pay to move up.",
      ],
      ["The full detail is on ", { href: "/how-ratings-work", label: "how ratings work" }, "."],
    ],
  },
  {
    q: "How do I get listed?",
    a: [
      [
        "Fill in the ",
        { href: GET_LISTED, label: "Get listed form" },
        " and we'll WhatsApp or call you within 2 working days. It's free.",
      ],
      [...ticketRoutes(LISTING_TICKET, LISTING_WHATSAPP, "Or raise"), " with your name, trade and the areas you cover."],
      [
        "You'll get a link showing exactly how your listing will look. Nothing goes live until you've read it and tapped to agree.",
      ],
    ],
  },
  {
    q: "How do I come off it?",
    a: [
      [
        ...ticketRoutes(REMOVAL_TICKET, REMOVAL_WHATSAPP),
        " and you're removed within one working day, no reason needed.",
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
        "Bolton Vouched is built and run by YSB Designs, a UK software studio that designs and builds web platforms for local communities and businesses. It started from the question everyone asks in the group: anyone know a good…?",
      ],
      [
        "YSB Designs is a trading name of YSB Ventures Ltd, registered in England and Wales, company number 16022339.",
      ],
    ],
  },
  {
    q: "How do I report a problem or a review?",
    a: [
      [
        "On a review, tap Report. For anything else, ",
        ...ticketRoutes(REPORT_TICKET, REPORT_WHATSAPP, "raise"),
        " and say which page it's on and what's wrong. Every ticket is looked at.",
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
        "If you sign in to leave a review, we keep your email address (and your Google account ID if you use Google), the name you show (like Sarah K.) and your reviews. The privacy notice has the detail.",
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
