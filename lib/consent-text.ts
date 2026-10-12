import { createHash } from "node:crypto";

// The statement a provider reads before agreeing to be listed. Bump the version when the wording changes:
// the version and a hash of the exact rendered text are stored with each consent as evidence.
export const CONSENT_TEXT_VERSION = "2026-10-12";

export const PRIVACY_PATH = "/privacy";
// The words in the privacy card's title that link to PRIVACY_PATH (the link adds no text of its own).
export const PRIVACY_LINK_TEXT = "privacy notice";

export type ConsentCardKey = "listing" | "reviews" | "leaving" | "fairness" | "privacy" | "controller";
/**
 * One card on the consent page. Its paragraph (the hashed text) is `${title}. ${body}`, or just `body` when there
 * is no title; the page renders the title in bold, then ". ", then the body, so the card's text is the paragraph.
 */
export type ConsentCard = { key: ConsentCardKey; title: string | null; body: string };

export type ConsentStatement = {
  cards: ConsentCard[];
  paragraphs: string[];
  sha256: string;
  owner: string;
  contact: string;
};

export function cardParagraph(card: ConsentCard): string {
  return card.title ? `${card.title}. ${card.body}` : card.body;
}

// Plain text only; render as text nodes (never as HTML).
// Returns null (fail closed) in production when the owner or contact details are not configured.
export function consentStatement(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): ConsentStatement | null {
  let owner = env.OWNER_LEGAL_NAME?.trim();
  let contact = env.CONTACT_EMAIL?.trim();
  if (!owner || !contact) {
    if (nodeEnv === "production") return null;
    owner ||= "Bolton Vouched (owner name pending)";
    contact ||= "hello@example.com";
  }
  const cards: ConsentCard[] = [
    {
      key: "listing",
      title: "What goes on your listing",
      body:
        "If you agree, Bolton Vouched will publish your business name, your name, your trade, the areas you cover, " +
        "anything you've asked us to say about you and the checks we've made (such as ID or insurance), with buttons to " +
        "call you or, if you've given us a WhatsApp number, to WhatsApp you. Your phone number isn't shown on the page.",
    },
    {
      key: "reviews",
      title: "People who've used you can review you",
      body:
        "Reviews go live without your approval. We don't remove one simply because you disagree, and you can reply to any review from your own page.",
    },
    {
      key: "leaving",
      title: "Leave whenever you like",
      body:
        "Tell us and you're removed within one working day. Your reviews are hidden with your profile and come back if you list again.",
    },
    {
      key: "fairness",
      title: "Free, and fair",
      body:
        "Your basic listing is free. Your place in the list comes from reviews only. Nobody can pay to move up the list. " +
        "We may later offer optional paid extras; you'll never be removed for not buying them, and they never change your place in the list.",
    },
    { key: "privacy", title: `I have read the ${PRIVACY_LINK_TEXT}`, body: "It explains what we keep and why." },
    {
      key: "controller",
      title: null,
      body: `Bolton Vouched is operated by ${owner}, the data controller for this information. Contact: ${contact}.`,
    },
  ];
  const paragraphs = cards.map(cardParagraph);
  const sha256 = createHash("sha256").update(paragraphs.join("\n\n")).digest("hex");
  return { cards, paragraphs, sha256, owner, contact };
}
