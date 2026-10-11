import Link from "next/link";

// The "BV" brick monogram and wordmark, as in the platform's brand bar, linking to the top of the showcase.
export function Brand() {
  return (
    <Link href="/" className="s-brand" aria-label="Bolton Vouched, top of page">
      <span className="s-mono" aria-hidden="true">
        <b>BV</b>
      </span>
      <span className="s-word">Bolton Vouched</span>
    </Link>
  );
}
