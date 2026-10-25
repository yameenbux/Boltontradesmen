import Link from "next/link";
import { type ConsentCard, PRIVACY_LINK_TEXT, PRIVACY_PATH, TERMS_LINK_TEXT, TERMS_PATH } from "@/lib/consent-shared";

/**
 * One statement paragraph. Its text content is exactly `cardParagraph(card)`, the text that is hashed as evidence:
 * the bold title (with the agreement title's words linked, adding no text), ". ", then the body. Used by the consent
 * page and by the trader's sign-up form, which show the same statement.
 */
export function ConsentParagraph({ card }: { card: ConsentCard }) {
  if (!card.title) return <p data-consent-paragraph>{card.body}</p>;
  if (card.key === "privacy") {
    const [beforeTerms, rest] = card.title.split(TERMS_LINK_TEXT);
    const [between, after] = rest.split(PRIVACY_LINK_TEXT);
    return (
      <p data-consent-paragraph>
        <b>
          {beforeTerms}
          <Link href={TERMS_PATH}>{TERMS_LINK_TEXT}</Link>
          {between}
          <Link href={PRIVACY_PATH}>{PRIVACY_LINK_TEXT}</Link>
          {after}.
        </b>
      </p>
    );
  }
  return (
    <p data-consent-paragraph>
      <b>{card.title}.</b> {card.body}
    </p>
  );
}
