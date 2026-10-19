import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Request sent | Bolton Vouched", robots: { index: false } };

export default async function RequestSentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="rq-sent-title">
        <div className="done">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" />
            <path d="M30 52 44 65 71 37" />
          </svg>
          <h1 id="rq-sent-title" className="display">
            Request sent
          </h1>
          <p>They&apos;ve been told by text and email. Keep your phone handy: they&apos;ll call or message you.</p>
          <Button href={platformPath("p", slug)} variant="secondary">
            Back to their page
          </Button>
        </div>
      </section>
    </main>
  );
}
