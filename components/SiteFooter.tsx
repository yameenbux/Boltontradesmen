import Link from "next/link";
import { COMPANY_LINE } from "@/lib/company";

export function SiteFooter() {
  return (
    <footer className="foot">
      <nav aria-label="Policies">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/how-ratings-work">How ratings work</Link>
      </nav>
      <p className="m-0">{COMPANY_LINE}</p>
    </footer>
  );
}
