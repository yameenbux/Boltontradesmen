import { BrandMark } from "@/components/BrandMark";
import { PrintButton } from "@/components/review-card/PrintButton";
import { qrSvg } from "@/lib/qr";
import { displayLink, reviewLink } from "@/lib/review-link";

// The printable review card (A6-ish postcard): brand, business name, a neutral ask, the QR code and the short link.
// Shown once on screen; printed four to an A4 sheet with dashed cut lines (globals.css, "review card").
// Wording rule: ask every customer for an honest review. Never "if you were happy", never ask for stars.

function Card({ name, display, qr }: { name: string; display: string; qr: string }) {
  return (
    <div className="rcard">
      <div className="rcard-in">
        <div className="rcard-brand">
          <span className="rcard-mono">
            <BrandMark />
          </span>
          <span className="rcard-word">
            Bolton Vouched <small>Local trades &amp; services</small>
          </span>
        </div>
        <div className="rcard-body">
          <p className="rcard-biz">{name}</p>
          <p className="rcard-ask">How did we do? Tell Bolton.</p>
        </div>
        {/* The SVG is drawn by lib/qr.ts from our own URL. */}
        <div className="rcard-qr" role="img" aria-label={`QR code for ${display}`} dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="rcard-foot">
          <p className="rcard-url">{display}</p>
          <p className="rcard-how">Takes a minute. Sign in with Google or your email.</p>
        </div>
      </div>
    </div>
  );
}

/** The card page's body for one listing: what it's for, the print button, the card, and the print-only sheet. */
export async function ReviewCardSheet({
  businessName,
  slug,
  live,
  back,
}: {
  businessName: string;
  slug: string;
  live: boolean;
  back: React.ReactNode;
}) {
  const link = reviewLink(slug);
  const display = displayLink(link);
  const qr = await qrSvg(link);
  return (
    <>
      <div className="rcard-page no-print">
        {back}
        <section className="auth-card" aria-labelledby={`card-${slug}`}>
          <div>
            <p className="eyebrow">Review card</p>
            <h1 id={`card-${slug}`}>{businessName}</h1>
            <p className="lede">
              Hand it over when you finish a job, or send it as a PDF. Customers scan the code or type the link to
              leave a review.
            </p>
          </div>
          <p className="rcard-rule" role="note">
            Ask every customer, not just the happy ones — that&apos;s the rule, and it&apos;s what makes your reviews
            count.
          </p>
          {!live && (
            <p className="form-alert">This listing isn&apos;t live right now, so the link won&apos;t take reviews yet.</p>
          )}
          <PrintButton />
          <p className="rcard-tip">Prints four cards to an A4 sheet. Cut along the dashed lines.</p>
        </section>
        <figure className="rcard-preview" aria-label={`Review card for ${businessName}`}>
          <Card name={businessName} display={display} qr={qr} />
        </figure>
      </div>
      <div className="rcard-sheet" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} name={businessName} display={display} qr={qr} />
        ))}
      </div>
    </>
  );
}
