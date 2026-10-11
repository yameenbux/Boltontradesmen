import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-neutral-200 px-4 py-6 text-sm text-neutral-600">
      <nav aria-label="Policies" className="mx-auto flex max-w-2xl flex-wrap gap-x-5 gap-y-2">
        <Link href="/privacy" className="underline">Privacy</Link>
        <Link href="/terms" className="underline">Terms</Link>
        <Link href="/how-ratings-work" className="underline">How ratings work</Link>
      </nav>
    </footer>
  );
}
