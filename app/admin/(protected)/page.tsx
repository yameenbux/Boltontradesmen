import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { TidySignInRecordsForm } from "@/components/admin/ModerationForms";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Providers | Admin | Bolton Vouched",
  description: "Every listed provider, their status and trades, with links to edit or invite them.",
};

const STATUS_TONE = { invited: "gold", consented: "outline", live: "sage", paused: "muted", removed: "muted" } as const;

type Row = { id: string; business_name: string; phone_e164: string; status: string; categories: string[] };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_providers");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const { data: c } = await supabase.rpc("admin_counts");
  const counts = (c ?? { pending: 0, under_check: 0, open_flags: 0, pending_proofs: 0 }) as {
    pending: number;
    under_check: number;
    open_flags: number;
    pending_proofs: number;
  };
  const waiting = [
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
                    {r.phone_e164} · {r.categories.join(", ") || "no categories"}
                  </small>
                </span>
                <Pill tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "muted"}>{r.status}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="a-card" aria-labelledby="tidy-title">
        <h2 id="tidy-title">Sign-in records</h2>
        <p className="a-lede">
          Sign-in records are deleted after 30 days, and accounts where a code was asked for but never used after 24
          hours, as the privacy notice says. Email-code requests do this every hour; press this to do it now.
        </p>
        <TidySignInRecordsForm />
      </section>
    </main>
  );
}
