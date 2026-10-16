"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import { PlatformChrome } from "@/components/PlatformChrome";
import { CONTACT_EMAIL, ticket } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";

// Catches errors below the root layout. Like the 404 it sits straight under the bare root layout, so it brings the
// chrome itself. retry() re-fetches and re-renders the failed segment; the digest matches the server log line.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PlatformChrome>
      <title>Something went wrong | Bolton Vouched</title>
      <main className="lost">
        <p className="eyebrow m-0">Error</p>
        <h1 className="display">Something went wrong</h1>
        <p>That didn&rsquo;t load properly. It&rsquo;s usually a blip, so try again in a moment.</p>
        <div className="lost-actions">
          <Button variant="primary" onClick={() => retry()}>
            Try again
          </Button>
          <Button href={platformPath()} variant="secondary">
            Browse trades
          </Button>
        </div>
        <p>
          Keeps happening? Email <a href={ticket("something went wrong")}>{CONTACT_EMAIL}</a>
          {error.digest ? ` and quote ${error.digest}` : ""}.
        </p>
      </main>
    </PlatformChrome>
  );
}
