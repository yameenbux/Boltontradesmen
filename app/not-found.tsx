import type { Metadata } from "next";
import { PlatformChrome } from "@/components/PlatformChrome";
import { CONTACT_EMAIL, ticket } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Page not found | Bolton Vouched",
  description: "We couldn't find that page. Browse Bolton's recommended trades or head back to the Bolton Vouched home page.",
};

// Rendered inside the bare root layout (no segment layout above it), so it brings the chrome itself.
export default function NotFound() {
  return (
    <PlatformChrome>
      <div className="page-enter">
        <main className="lost">
          <p className="eyebrow m-0">Error 404</p>
          <h1 className="display">We can&rsquo;t find that page</h1>
          <p>It may have moved, or the link might be mistyped. Everyone we list is a tap away from the trades page.</p>
          <div className="lost-actions">
            <Button href={platformPath()} variant="primary">
              Browse trades
            </Button>
            <Button href="/" variant="secondary">
              Bolton Vouched home
            </Button>
          </div>
          <p>
            Still stuck? Email <a href={ticket("page not found")}>{CONTACT_EMAIL}</a>.
          </p>
        </main>
      </div>
    </PlatformChrome>
  );
}
