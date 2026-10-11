import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { CheckForm, ConsentLinkButton, ProviderForm, StatusForm } from "@/components/admin/ProviderForms";
import { requireAdmin } from "@/lib/admin";

const STATUS_TONE = { invited: "gold", consented: "outline", live: "sage", paused: "muted", removed: "muted" } as const;

export const dynamic = "force-dynamic";

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
  category_ids: string[];
  checks: Check[];
};

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
        <ConsentLinkButton providerId={p.id} status={p.status} />
      </section>

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
                {c.reference ? ` (${c.reference})` : ""} · checked {c.checked_at.slice(0, 10)}
                {c.expires_on ? ` · expires ${c.expires_on}` : ""}
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
