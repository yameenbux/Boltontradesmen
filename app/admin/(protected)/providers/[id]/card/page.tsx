import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewCardSheet } from "@/components/review-card/ReviewCard";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review card | Admin | Bolton Vouched",
  description: "A provider's printable review card, for traders who don't sign in.",
};

type Detail = { id: string; slug: string; business_name: string; status: string };

/** The same card the trader prints from their area, so the owner can print or send it for them. */
export default async function ProviderCardAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_get_provider", { p_id: id });
  const p = data as Detail | null;
  if (!p || p.status === "removed") notFound();

  return (
    <main className="flex flex-col gap-5">
      <ReviewCardSheet
        businessName={p.business_name}
        slug={p.slug}
        live={p.status === "live"}
        back={
          <Link href={`/admin/providers/${p.id}`} className="a-link">
            ← {p.business_name}
          </Link>
        }
      />
    </main>
  );
}
