import type { Metadata } from "next";
import Link from "next/link";
import {
  type ConsentCard,
  type ConsentCardKey,
  consentStatement,
  PRIVACY_LINK_TEXT,
  PRIVACY_PATH,
} from "@/lib/consent-text";
import { firstName } from "@/lib/initials";
import { createServiceClient } from "@/lib/supabase/service";
import { ConsentForm } from "./ConsentForm";
import { InvalidLink } from "./InvalidLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Bolton Vouched listing",
  description: "Check the details of your Bolton Vouched listing and say yes to going live.",
  robots: { index: false, follow: false },
};

type Preview = {
  business_name: string;
  categories: string[];
  areas: string[];
  contact_name: string | null;
  has_whatsapp: boolean;
};

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const ICONS: Record<Exclude<ConsentCardKey, "controller">, React.ReactNode> = {
  listing: (
    <svg {...svg}>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  reviews: (
    <svg {...svg}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  ),
  leaving: (
    <svg {...svg}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  fairness: (
    <svg {...svg}>
      <path d="M16 7a4 4 0 0 0-8 1v12" />
      <path d="M5 13h8M5 20h13" />
    </svg>
  ),
  privacy: (
    <svg {...svg}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  ),
};

/**
 * One statement paragraph. Its text content is exactly `cardParagraph(card)`, the text that is hashed as evidence:
 * the bold title (with the privacy title's words linked, adding no text), ". ", then the body.
 */
function Paragraph({ card }: { card: ConsentCard }) {
  if (!card.title) return <p data-consent-paragraph>{card.body}</p>;
  let title: React.ReactNode = card.title;
  if (card.key === "privacy") {
    const [before, after] = card.title.split(PRIVACY_LINK_TEXT);
    title = (
      <>
        {before}
        <Link href={PRIVACY_PATH}>{PRIVACY_LINK_TEXT}</Link>
        {after}
      </>
    );
  }
  return (
    <p data-consent-paragraph>
      <b>{title}.</b> {card.body}
    </p>
  );
}

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return <Invalid />;
  const statement = consentStatement();
  if (!statement) {
    console.error("consent page unavailable: OWNER_LEGAL_NAME and CONTACT_EMAIL must be set in production");
    return <Invalid />;
  }
  const { data } = await createServiceClient().rpc("consent_preview", { p_token: token });
  const p = (data as Preview[] | null)?.[0];
  if (!p) return <Invalid />;

  const first = firstName(p.contact_name);
  const greeting = first
    ? `${first}, here's how you'll appear on Bolton Vouched`
    : "Here's how you'll appear on Bolton Vouched";
  const points = statement.cards.filter((c) => c.key !== "controller");
  const controller = statement.cards.find((c) => c.key === "controller")!;

  return (
    <main className="consent">
      <ConsentForm token={token} firstName={first}>
        <section className="consent-top" aria-labelledby="consent-title">
          <p className="eyebrow">Your free listing</p>
          <h1 id="consent-title">{greeting}</h1>
          <dl className="kv">
            <dt>Business</dt>
            <dd>{p.business_name}</dd>
            {p.contact_name && (
              <>
                <dt>Name</dt>
                <dd>{p.contact_name}</dd>
              </>
            )}
            <dt>{p.categories.length > 1 ? "Trades" : "Trade"}</dt>
            <dd>{p.categories.length ? p.categories.join(", ") : "None yet"}</dd>
            <dt>Areas</dt>
            <dd>{p.areas.length ? p.areas.join(", ") : "None yet"}</dd>
            <dt>Contact</dt>
            <dd>
              {p.has_whatsapp
                ? "Call and WhatsApp buttons (your number isn't shown)"
                : "A call button (your number isn't shown)"}
            </dd>
          </dl>
        </section>
        <h2 className="sr-only">What you&apos;re agreeing to</h2>
        <ul className="points stagger">
          {points.map((card) => (
            <li key={card.key}>
              <span className="pi">{ICONS[card.key as keyof typeof ICONS]}</span>
              <Paragraph card={card} />
            </li>
          ))}
        </ul>
        <div className="controller">
          <Paragraph card={controller} />
        </div>
      </ConsentForm>
    </main>
  );
}

function Invalid() {
  return (
    <main className="consent">
      <InvalidLink />
    </main>
  );
}
