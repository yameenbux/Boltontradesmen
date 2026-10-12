import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { platformPath } from "@/lib/paths";

// Sticky header on every page: brick tile with the house-and-tick mark, wordmark and tagline, theme toggle.
export function BrandBar() {
  return (
    <header className="bar">
      <Link href={platformPath()} className="brand press" aria-label="Bolton Vouched home">
        <span className="mono" aria-hidden="true">
          <BrandMark />
        </span>
        <span className="word">
          Bolton Vouched<small>Local trades &amp; services</small>
        </span>
      </Link>
      <ThemeToggle />
    </header>
  );
}
