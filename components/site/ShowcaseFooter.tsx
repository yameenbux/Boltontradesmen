import Link from "next/link";
import { Brand } from "@/components/site/Brand";
import { COMPANY_LINE, CONTACT_EMAIL, MAILTO, PLATFORM } from "@/components/site/content";

export function ShowcaseFooter() {
  return (
    <footer className="s-foot">
      <div className="s-wrap">
        <Brand />
        <nav aria-label="Site">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/how-ratings-work">How ratings work</Link>
          <Link href={PLATFORM}>Open the platform</Link>
        </nav>
        <p>{COMPANY_LINE}</p>
        <p>
          <a href={MAILTO}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </footer>
  );
}
