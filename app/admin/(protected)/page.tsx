import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { TidySignInRecordsForm } from "@/components/admin/ModerationForms";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Providers | Admin | Bolton Vouched",
  description: "Every listed provider, their status and trades, new sign-ups to check first, with links to edit them.",
};

const STATUS_TONE = { invited: "gold", consented: "outline", live: "sage", paused: "muted", removed: "muted" } as const;

type Row = {
  id: string;
  business_name: string;
  phone_e164: string;
  status: string;
  categories: string[];
  reviewed_at?: string | null;
  signup_trade?: string | null;
};

// Went live from a trader's own sign-up and not checked yet (listed first).
const toCheck = (r: Row) => !r.reviewed_at && r.status !== "removed";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_providers");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const { data: c } = await supabase.rpc("admin_counts");
  const counts = (c ?? { pending: 0, under_check: 0, open_flags: 0, pending_proofs: 0, listing_requests: 0 }) as {
    pending: number;
    under_check: number;
    open_flags: number;
    pending_proofs: number;
    listing_requests?: number;
    pending_pro_documents?: number;
    questions?: number;
  };
  const unchecked = rows.filter(toCheck).length;
  const waiting = [
    {
      href: "/admin",
      n: unchecked,
      text: `${unchecked} new listing${unchecked === 1 ? "" : "s"} to check`,
    },
    {
      href: "/admin/reviews",
      n: counts.pending ?? 0,
      text: `${counts.pending ?? 0} awaiting approval`,
    },
    { href: "/admin/reviews", n: counts.under_check, text: `${counts.under_check} under check` },
    {
      href: "/admin/flags",
      n: counts.open_flags,
      text: `${counts.open_flags} open flag${counts.open_flags === 1 ? "" : "s"}`,
    },
    {
      href: "/admin/proofs",
      n: counts.pending_proofs,
      text: `${counts.pending_proofs} proof${counts.pending_proofs === 1 ? "" : "s"} to check`,
    },
    {
      href: "/admin/requests",
      n: counts.listing_requests ?? 0,
      text: `${counts.listing_requests ?? 0} new listing request${counts.listing_requests === 1 ? "" : "s"}`,
    },
    {
      href: "/admin/pro",
      n: counts.pending_pro_documents ?? 0,
      text: `${counts.pending_pro_documents ?? 0} Pro document${counts.pending_pro_documents === 1 ? "" : "s"} to check`,
    },
    {
      href: "/admin/questions",
      n: counts.questions ?? 0,
      text: `${counts.questions ?? 0} question${counts.questions === 1 ? "" : "s"} or answer${counts.questions === 1 ? "" : "s"} to look at`,
    },
  ];
  return (
    <main className="flex flex-col gap-5">
      <ul className="a-counts" aria-label="Waiting for you">
        {waiting.map((w) => (
          <li key={w.text}>
            <Link href={w.href} className="press" data-some={w.n > 0 || undefined}>
              {w.text}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="a-title">Providers</h1>
        <Button href="/admin/providers/new">Add provider</Button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No providers yet.</p>
      ) : (
        <ul className="a-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/providers/${r.id}`} className="a-row press">
                <span className="min-w-0">
                  <b>{r.business_name}</b>
                  <small>
                    {r.phone_e164} · {r.categories.join(", ") || (r.signup_trade ? `typed “${r.signup_trade}”` : "no categories")}
                  </small>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {toCheck(r) && <Pill tone="gold">New, check me</Pill>}
                  <Pill tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "muted"}>{r.status}</Pill>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="a-card" aria-labelledby="tidy-title">
        <h2 id="tidy-title">Sign-in records</h2>
        <p className="a-lede">
          Sign-in records are deleted after 30 days, accounts where a code was asked for but never used after 24
          hours, and listing requests after 90 days, as the privacy notice says. Email-code requests do this every
          hour; press this to do it now.
        </p>
        <TidySignInRecordsForm />
      </section>
    </main>
  );
}
