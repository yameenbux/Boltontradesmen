import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareReviewLink } from "@/components/review-card/ShareReviewLink";
import { WebsiteBadge } from "@/components/share/WebsiteBadge";
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
import { AvailabilityForm } from "@/components/provider/AvailabilityForm";
import { EnquiryStats } from "@/components/provider/EnquiryStats";
import { setProviderAvailability } from "@/app/admin/(protected)/providers/actions";
import { FoundingProForm } from "@/components/admin/FoundingProForm";
import { requireAdmin } from "@/lib/admin";
import { availabilityNow, bookedRange, type StoredAvailability } from "@/lib/availability";
import { dayMonthYear } from "@/lib/checks";
import { toEnquiryStats } from "@/lib/enquiries";
import { DOCUMENT_LABEL, type DocumentKind } from "@/lib/pro";
import { reviewShare } from "@/lib/review-link";
import { badgeShare } from "@/lib/share";
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
  availability?: StoredAvailability;
};

const LINKABLE = ["consented", "live", "paused"];

// Today plus six months, as yyyy-mm-dd: the usual founding offer.
function sixMonthsOn(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

type ProDetail = {
  is_pro: boolean;
  subscriptions: {
    plan: "monthly" | "annual";
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string;
    stripe_subscription_id: string;
    created_at: string;
  }[];
  documents: { id: string; kind: DocumentKind; status: string; reason: string | null; created_at: string; file_deleted: boolean }[];
  photo_count: number;
};

export default async function ProviderAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const [{ data }, { data: categories }, { data: enquiries }, { data: proData }, { data: grantData }] = await Promise.all([
    supabase.rpc("admin_get_provider", { p_id: id }),
    supabase.from("categories").select("id, name").order("name"),
    supabase.rpc("admin_enquiry_stats", { p_provider: id }),
    supabase.rpc("admin_provider_pro", { p_provider: id }),
    supabase.rpc("admin_pro_grant", { p_provider: id }),
  ]);
  const grant = grantData as { until: string; note: string | null; active: boolean } | null;
  const p = data as Detail | null;
  const pro = proData as ProDetail | null;
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

      {enquiries && (
        <section aria-label="Enquiries" className="a-card">
          <h2>Enquiries</h2>
          <EnquiryStats stats={toEnquiryStats(enquiries)} id={`chart-${p.id}`} admin />
        </section>
      )}

      {pro && (
        <section aria-label="Pro" className="a-card">
          <h2>Pro</h2>
          <h3>Founding Pro</h3>
          <p className="text-ink-2" data-testid="grant-state">
            {grant
              ? `Free Pro until ${dayMonthYear(grant.until)}${grant.active ? "" : " (ended)"}${grant.note ? ` · ${grant.note}` : ""}`
              : "No founding Pro. Switch it on to give this trader Pro free, without Stripe."}
          </p>
          <FoundingProForm providerId={p.id} grant={grant} suggestedUntil={sixMonthsOn()} />
          <h3>Paid Pro</h3>
          {pro.subscriptions.length === 0 ? (
            <p className="text-ink-2">Never had a Stripe subscription.</p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <Pill tone={pro.is_pro ? "sage" : "muted"}>
                  <strong data-testid="pro-state">{pro.is_pro ? "Pro on" : "Pro off"}</strong>
                </Pill>
                <span className="text-ink-2">
                  {pro.photo_count} photo{pro.photo_count === 1 ? "" : "s"} ·{" "}
                  <Link href="/admin/pro" className="a-link">
                    Pro page
                  </Link>
                </span>
              </p>
              <ul className="grid gap-2">
                {pro.subscriptions.map((s) => (
                  <li key={s.stripe_subscription_id}>
                    {s.plan === "annual" ? "£100 a year" : "£10 a month"} · Stripe status {s.status}
                    {s.cancel_at_period_end ? " (cancels at period end)" : ""}
                    {s.current_period_end ? ` · period ends ${dayMonthYear(s.current_period_end)}` : ""} · started{" "}
                    {dayMonthYear(s.created_at)}
                    <br />
                    <small className="a-hint">
                      {s.stripe_customer_id} · {s.stripe_subscription_id}
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {pro.documents.length > 0 && (
            <ul className="grid gap-2">
              {pro.documents.map((d) => (
                <li key={d.id}>
                  {DOCUMENT_LABEL[d.kind] ?? d.kind} sent {dayMonthYear(d.created_at)} · {d.status}
                  {d.reason ? ` (${d.reason})` : ""}
                  {d.file_deleted ? " · file deleted" : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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

      {p.status !== "removed" && (
        <section aria-label="Website badge" className="a-card">
          <h2>Website badge</h2>
          <p className="a-hint">
            The trader&apos;s &ldquo;Vouched in Bolton&rdquo; badge for their website, Facebook page or van, linking to
            their profile. Send them the code or the PNG.
            {p.status !== "live" && " It works once the listing is live."}
          </p>
          {p.status === "live" && <WebsiteBadge {...badgeShare(p.slug, p.business_name)} />}
        </section>
      )}

      {p.status !== "removed" && (
        <section aria-label="Availability" className="a-card">
          <h2>Availability</h2>
          <p className="a-hint">
            {p.linked
              ? "The trader sets this from their listing page. Change it here if they ask you to."
              : "Not linked to an account, so set it here if the trader tells you."}
            {p.status !== "live" && " It shows once the listing is live."}
          </p>
          <AvailabilityForm
            action={setProviderAvailability}
            now={availabilityNow(p.availability)}
            range={bookedRange()}
            providerId={p.id}
            admin
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
