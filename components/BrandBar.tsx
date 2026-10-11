import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

// Sticky header on every page: "BV" brick monogram, wordmark and tagline, theme toggle.
export function BrandBar() {
  return (
    <header className="bar">
      <Link href="/" className="brand press" aria-label="Bolton Vouched home">
        <span className="mono" aria-hidden="true">
          <b>BV</b>
        </span>
        <span className="word">
          Bolton Vouched<small>Recommended by Bolton</small>
        </span>
      </Link>
      <ThemeToggle />
    </header>
  );
}
