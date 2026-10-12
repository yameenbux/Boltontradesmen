import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

// The brick tile with the house-and-tick mark, and the wordmark, as in the platform's brand bar, linking to the top of the showcase.
export function Brand() {
  return (
    <Link href="/" className="s-brand" aria-label="Bolton Vouched, top of page">
      <span className="s-mono" aria-hidden="true">
        <BrandMark />
      </span>
      <span className="s-word">Bolton Vouched</span>
    </Link>
  );
}
