import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";
import { listNames, recommendedBy, type PublicAnswer, type RecommendationGroup } from "@/lib/questions";

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z" />
  </svg>
);

/**
 * Call and WhatsApp through /api/contact, exactly as on the profile: each tap counts as an enquiry, and no number
 * ever reaches the page. Plain `<a rel="nofollow">`, so prefetchers and crawlers never log one.
 */
function ContactButtons({ slug, businessName, hasWhatsapp }: { slug: string; businessName: string; hasWhatsapp: boolean }) {
  return (
    <div className={hasWhatsapp ? "q-contact" : "q-contact one"}>
      <Button href={`/api/contact/${slug}?via=call`} rel="nofollow" aria-label={`Call ${businessName}`}>
        <PhoneIcon />
        Call
      </Button>
      {hasWhatsapp && (
        <Button
          href={`/api/contact/${slug}?via=whatsapp`}
          rel="nofollow"
          variant="secondary"
          aria-label={`WhatsApp ${businessName}`}
        >
          <WhatsAppIcon />
          WhatsApp
        </Button>
      )}
    </div>
  );
}

const reportHref = (questionId: string, answerId: string) =>
  `${platformPath("ask", questionId, "report")}?answer=${encodeURIComponent(answerId)}`;

/** One provider and everyone who recommended them: "Recommended by 3 people", the names, their notes. */
export function RecommendationCard({ questionId, g }: { questionId: string; g: RecommendationGroup }) {
  return (
    <article className="rec" aria-label={g.businessName}>
      <div className="rec-head">
        <Link href={platformPath("p", g.providerSlug)} className="rec-name press">
          {g.businessName}
        </Link>
        <span className="rec-count">{g.count}</span>
      </div>
      <p className="rec-by">
        <b>{recommendedBy(g.count)}</b>: {listNames(g.names)}
      </p>
      {g.notes.length > 0 && (
        <ul className="rec-notes">
          {g.notes.map((n) => (
            <li key={n.id}>
              <q>{n.note}</q>
              <span>{n.name}</span>
            </li>
          ))}
        </ul>
      )}
      <ContactButtons slug={g.providerSlug} businessName={g.businessName} hasWhatsapp={g.hasWhatsapp} />
      <details className="rec-report">
        <summary>Report</summary>
        <ul>
          {g.answerIds.map((a) => (
            <li key={a.id}>
              <a href={reportHref(questionId, a.id)} className="link">
                Report {a.name}&apos;s recommendation
              </a>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

/** "<Business> says they can help": the trader speaking for themselves, kept apart from residents' recommendations. */
export function CanHelpCard({ questionId, a }: { questionId: string; a: PublicAnswer }) {
  return (
    <article className="rec rec-self" aria-label={`${a.businessName} says they can help`}>
      <p className="rec-label">The trader, speaking for themselves</p>
      <p className="rec-says">
        <Link href={platformPath("p", a.providerSlug)} className="rec-name press">
          {a.businessName}
        </Link>{" "}
        says they can help
      </p>
      {a.note && (
        <p className="rec-self-note">
          <q>{a.note}</q>
        </p>
      )}
      <ContactButtons slug={a.providerSlug} businessName={a.businessName} hasWhatsapp={a.hasWhatsapp} />
      <a href={reportHref(questionId, a.id)} className="rec-report-link">
        Report
      </a>
    </article>
  );
}
