import Link from "next/link";
import { policyIdentity } from "@/lib/policy-config";

export function SiteFooter() {
  const { owner } = policyIdentity();
  return (
    <footer className="foot">
      <nav aria-label="Policies">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/how-ratings-work">How ratings work</Link>
      </nav>
      <p className="m-0">Bolton Vouched is operated by {owner}.</p>
    </footer>
  );
}
