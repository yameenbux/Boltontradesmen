import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { platformPath } from "@/lib/paths";

// Sticky header on every page: brick tile with the house-and-tick mark, wordmark and tagline, account link, theme toggle.
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
