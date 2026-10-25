import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-static";

export const metadata: Metadata = pageMetadata({
  title: "Thanks for your request | Bolton Vouched",
  description: "We've got your details and we'll be in touch about your Bolton Vouched listing.",
  path: "/get-listed/thanks",
  noindex: true,
});

export default function GetListedThanksPage() {
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="thanks-title">
        <div className="done">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" />
            <path d="M30 52 44 65 71 37" />
          </svg>
          <h1 id="thanks-title">Thanks, we&apos;ve got your details</h1>
          <p>
            We&apos;ll WhatsApp or call you within 2 working days to check your details and send your listing link.
          </p>
        </div>
        <ul className="thanks-list">
          <li>The link shows exactly how your listing will look. Nothing goes live until you&apos;ve agreed to it.</li>
          <li>
            Your basic listing is free and stays free. <a href="/for-traders">Pro</a> is optional and never changes your
            place in the list.
          </li>
        </ul>
        <Button href={platformPath()}>Browse local trades</Button>
        <Button href="/" variant="secondary">
          Back to the home page
        </Button>
      </section>
    </main>
  );
}
