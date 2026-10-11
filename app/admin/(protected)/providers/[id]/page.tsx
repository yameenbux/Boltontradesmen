import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckForm, ConsentLinkButton, ProviderForm, StatusForm } from "@/components/admin/ProviderForms";
import { requireAdmin } from "@/lib/admin";

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
    <main className="flex flex-col gap-8">
      <div>
        <Link href="/admin" className="inline-flex min-h-12 items-center font-semibold underline">
          ← Providers
        </Link>
        <h1 className="break-words text-2xl font-extrabold">{p.business_name}</h1>
        <p>
          Status: <strong data-testid="provider-status">{p.status}</strong> · {p.phone_e164}
        </p>
      </div>

      <section aria-label="Consent link" className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Consent</h2>
        <ConsentLinkButton providerId={p.id} status={p.status} />
      </section>

      <section aria-label="Status" className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Change status</h2>
        <StatusForm providerId={p.id} current={p.status} hasConsent={p.consent_at !== null} />
      </section>

      <section aria-label="Checks" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Checks</h2>
        {p.checks.length === 0 ? (
          <p>No checks recorded.</p>
        ) : (
          <ul className="flex flex-col gap-1">
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

      <section aria-label="Details" className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Details</h2>
        <ProviderForm categories={categories ?? []} values={p} />
      </section>
    </main>
  );
}
