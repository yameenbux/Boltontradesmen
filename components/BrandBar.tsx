import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { platformPath } from "@/lib/paths";

// Sticky header on every page: brick tile with the house-and-tick mark, wordmark and tagline, Ask Bolton, account link,
// theme toggle.
export function BrandBar() {
  return (
    <header className="bar">
      <Link href={platformPath()} className="brand press">
        <span className="mono" aria-hidden="true">
          <BrandMark />
        </span>
        <span className="word">
          Bolton Vouched <small>Local trades &amp; services</small>
        </span>
      </Link>
      <div className="bar-actions">
        <Link href={platformPath("ask")} className="icon-btn press bar-ask" aria-label="Ask Bolton">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2M12 16.5h.01" />
          </svg>
        </Link>
        {/* Static link: the bar never reads the session, so public pages stay cookie-free. */}
        <Link href={platformPath("account")} className="icon-btn press" aria-label="Account" prefetch={false}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
