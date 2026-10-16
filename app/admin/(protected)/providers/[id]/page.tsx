import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareReviewLink } from "@/components/review-card/ShareReviewLink";
import { Pill } from "@/components/ui/Pill";
import {
  CheckForm,
  ConsentLinkButton,
  ProviderForm,
  ReinviteForm,
  StatusForm,
  TraderLinkButton,
  UnlinkForm,
} from "@/components/admin/ProviderForms";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
import { reviewShare } from "@/lib/review-link";
import { phoneSignInEnabled } from "@/lib/sign-in-methods";

const STATUS_TONE = { invited: "gold", consented: "outline", live: "sage", paused: "muted", removed: "muted" } as const;

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Provider | Admin | Bolton Vouched",
  description: "Edit a provider's listing, checks, status and consent link.",
};

type Check = { id: string; kind: string; reference: string | null; expires_on: string | null; checked_at: string };
type Detail = {
  id: string;
  slug: string;
  business_name: string;
  contact_name: string | null;
  phone_e164: string;
  whatsapp_e164: string | null;
  areas: string[];
  bio: string | null;
  status: string;
  consent_at: string | null;
  consent_token_expires_at: string | null;
  category_ids: string[];
  checks: Check[];
  linked: boolean;
  trader_link_expires_at: string | null;
};

const LINKABLE = ["consented", "live", "paused"];

export default async function ProviderAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase.rpc("admin_get_provider", { p_id: id }),
    supabase.from("categories").select("id, name").order("name"),
  ]);
  const p = data as Detail | null;
  if (!p) notFound();

  return (
    <main className="flex flex-col gap-5">
      <div>
        <Link href="/admin" className="a-link">
          ← Providers
        </Link>
        <h1 className="a-title">{p.business_name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-ink-2">
          Status:{" "}
          <Pill tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE] ?? "muted"}>
            <strong data-testid="provider-status">{p.status}</strong>
          </Pill>{" "}
          · {p.phone_e164}
        </p>
      </div>

      <section aria-label="Consent link" className="a-card a-consent">
        <h2>Consent</h2>
        <ConsentLinkButton providerId={p.id} status={p.status} expires={dayMonthYear(p.consent_token_expires_at)} />
        {/* Always mounted, so the new link stays on screen after the page refreshes to "invited". */}
        <ReinviteForm providerId={p.id} removed={p.status === "removed"} />
      </section>

      <section aria-label="Trader sign-in" className="a-card a-consent">
        <h2>Trader sign-in</h2>
        {p.linked ? (
          <>
            <p className="a-ok" data-testid="provider-linked">
              Linked to an account
            </p>
            <UnlinkForm providerId={p.id} />
          </>
        ) : LINKABLE.includes(p.status) ? (
          <TraderLinkButton providerId={p.id} expires={dayMonthYear(p.trader_link_expires_at)} />
        ) : (
          <p className="text-ink-2">
            {p.status === "removed"
              ? "Not available for a removed provider."
              : "Available once the provider has agreed to be listed."}
          </p>
        )}
        {!p.linked && LINKABLE.includes(p.status) && phoneSignInEnabled() && (
          <p className="a-hint">Sign-in by text is on, so they can also sign in with the number on this listing.</p>
        )}
      </section>

      {p.status !== "removed" && (
        <section aria-label="Review requests" className="a-card">
          <h2>Review requests</h2>
          <p className="a-hint">
            The trader&apos;s review link and printable QR card, to send or print for them. Reviews that start here are
            marked &ldquo;via review card&rdquo; in the review queues.
            {p.status !== "live" && " The link takes reviews once the listing is live."}
          </p>
          <ShareReviewLink
            {...reviewShare(p.slug, p.business_name)}
            cardHref={`/admin/providers/${p.id}/card`}
            label="Review link"
          />
        </section>
      )}

      <section aria-label="Status" className="a-card">
        <h2>Change status</h2>
        <StatusForm providerId={p.id} current={p.status} hasConsent={p.consent_at !== null} />
      </section>

      <section aria-label="Checks" className="a-card">
        <h2>Checks</h2>
        {p.checks.length === 0 ? (
          <p className="text-ink-2">No checks recorded.</p>
        ) : (
          <ul className="grid gap-2">
            {p.checks.map((c) => (
              <li key={c.id}>
                {c.kind}
                {c.reference ? ` (${c.reference})` : ""} · checked {dayMonthYear(c.checked_at)}
                {c.expires_on ? ` · expires ${dayMonthYear(c.expires_on)}` : ""}
              </li>
            ))}
          </ul>
        )}
        <CheckForm providerId={p.id} />
      </section>

      <section aria-label="Details" className="a-card">
        <h2>Details</h2>
        <ProviderForm categories={categories ?? []} values={p} />
      </section>
    </main>
  );
}
