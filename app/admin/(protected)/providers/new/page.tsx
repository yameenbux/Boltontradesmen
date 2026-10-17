import type { Metadata } from "next";
import Link from "next/link";
import { ProviderForm } from "@/components/admin/ProviderForms";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Add provider | Admin | Bolton Vouched",
  description: "Add a new provider to the directory and get their consent link.",
};

type Search = {
  business?: string | string[];
  name?: string | string[];
  phone?: string | string[];
  request?: string | string[];
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 120) || undefined;

// ?business=…&name=…&phone=…&request=… (from a listing request) fills the form in; the admin still checks and saves it,
// and saving marks that request done.
export default async function NewProviderPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase } = await requireAdmin();
  const q = await searchParams;
  const { data } = await supabase.from("categories").select("id, name").order("name");
  return (
    <main className="flex flex-col gap-4">
      <Link href="/admin" className="a-link">
        ← Providers
      </Link>
      <h1 className="a-title">Add provider</h1>
      <div className="a-card">
        <ProviderForm
          categories={data ?? []}
          values={{ business_name: one(q.business), contact_name: one(q.name), phone_e164: one(q.phone) }}
          fromRequest={one(q.request)}
        />
      </div>
    </main>
  );
}
