// The parts of the consent statement a browser component needs (the sign-up form shows the statement too).
// No node imports here: lib/consent-text.ts builds and hashes the statement on the server.

export const PRIVACY_PATH = "/privacy";
// The words in the agreement card's title that link to PRIVACY_PATH and TERMS_PATH (the links add no text of their own).
export const PRIVACY_LINK_TEXT = "privacy notice";
export const TERMS_PATH = "/terms";
export const TERMS_LINK_TEXT = "terms";

export type ConsentCardKey = "listing" | "reviews" | "leaving" | "fairness" | "privacy" | "controller";
/**
 * One card on the consent page. Its paragraph (the hashed text) is `${title}. ${body}`, `${title}.` when the body is
 * empty, or just `body` when there is no title; the page renders the title in bold, then ". ", then the body, so the
 * card's text is the paragraph.
 */
export type ConsentCard = { key: ConsentCardKey; title: string | null; body: string };

export function cardParagraph(card: ConsentCard): string {
  if (!card.title) return card.body;
  return card.body ? `${card.title}. ${card.body}` : `${card.title}.`;
}
