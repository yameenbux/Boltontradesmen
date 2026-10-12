import type { Metadata } from "next";
import Link from "next/link";
import { ProviderForm } from "@/components/admin/ProviderForms";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Add provider | Admin | Bolton Vouched",
  description: "Add a new provider to the directory and get their consent link.",
};

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
