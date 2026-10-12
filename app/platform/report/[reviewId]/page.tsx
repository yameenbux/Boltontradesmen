import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportForm } from "@/components/review/ReportForm";
import { Pill } from "@/components/ui/Pill";
import { requireMember } from "@/lib/auth";
import { getProvider } from "@/lib/directory";
import { platformPath } from "@/lib/paths";
import { ID_PATTERN } from "@/lib/review-form";
import { monthYear } from "@/lib/review-text";
import { getPublicReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report a review | Bolton Vouched", robots: { index: false } };

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export default async function ReportPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  await requireMember(ID_PATTERN.test(reviewId) ? platformPath("report", reviewId) : platformPath("account"));
  if (!ID_PATTERN.test(reviewId)) notFound();
  const found = await getPublicReview(reviewId);
  if (!found) notFound();
  const { review: r, providerSlug } = found;
  const provider = await getProvider(providerSlug);
  const name = provider?.businessName ?? "the provider";
  const back = platformPath("p", providerSlug);

  return (
    <main className="auth">
      <a href={back} className="back press">
        <Chevron />
        {name}
      </a>
      <section className="auth-card" aria-labelledby="report-title">
        <div>
          <p className="eyebrow">Report a review</p>
          <h1 id="report-title">Something wrong with this review?</h1>
          <p className="lede">Tell us and the admin will look. Reviews come down only for a good reason.</p>
        </div>
        <figure className="report-quote">
          <figcaption>
            <b>{r.reviewerName}</b> on {name} · {monthYear(r.jobMonth)}
            {r.underCheck && <Pill tone="gold">Under check</Pill>}
          </figcaption>
          {r.comment ? (
            <blockquote>{r.comment}</blockquote>
          ) : (
            <p className="no-comment">No comment, just the answers.</p>
          )}
        </figure>
        <ReportForm reviewId={r.id} backHref={back} backLabel={name} />
      </section>
    </main>
  );
}
