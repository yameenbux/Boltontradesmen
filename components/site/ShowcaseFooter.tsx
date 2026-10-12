import Link from "next/link";
import { Brand } from "@/components/site/Brand";
import {
  COMPANY_LINE,
  CONTACT_EMAIL,
  GET_LISTED,
  MAILTO,
  PLATFORM,
  SUPPORT_WHATSAPP_DISPLAY,
  WHATSAPP,
} from "@/components/site/content";

export function ShowcaseFooter() {
  return (
    <footer className="s-foot">
      <div className="s-wrap">
        <Brand />
        <nav aria-label="Site">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/how-ratings-work">How ratings work</Link>
          <Link href="/review-policy">Review policy</Link>
          <Link href="/fake-reviews-policy">Fake reviews</Link>
          <Link href={GET_LISTED}>Get listed</Link>
          <Link href={PLATFORM}>Open the platform</Link>
        </nav>
        <p>{COMPANY_LINE}</p>
        <p>
          Raise a support ticket by emailing <a href={MAILTO}>{CONTACT_EMAIL}</a> or on WhatsApp at{" "}
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
            {SUPPORT_WHATSAPP_DISPLAY}
          </a>
        </p>
      </div>
    </footer>
  );
}
