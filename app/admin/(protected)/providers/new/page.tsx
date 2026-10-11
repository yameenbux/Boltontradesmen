import Link from "next/link";
import { ProviderForm } from "@/components/admin/ProviderForms";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewProviderPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("categories").select("id, name").order("name");
  return (
    <main className="flex flex-col gap-4">
      <Link href="/admin" className="a-link">
        ← Providers
      </Link>
      <h1 className="a-title">Add provider</h1>
      <div className="a-card">
        <ProviderForm categories={data ?? []} />
      </div>
    </main>
  );
}
