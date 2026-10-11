import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Row = { id: string; business_name: string; phone_e164: string; status: string; categories: string[] };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_providers");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Providers</h1>
        <Link href="/admin/providers/new" className="inline-flex min-h-12 items-center rounded bg-neutral-900 px-4 font-bold text-white">
          Add provider
        </Link>
      </div>
      {rows.length === 0 ? (
        <p>No providers yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-300 border-y border-neutral-300">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/providers/${r.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <span className="block font-bold">{r.business_name}</span>
                  <span className="block text-sm text-neutral-700">
                    {r.phone_e164} · {r.categories.join(", ") || "no categories"}
                  </span>
                </span>
                <span className="rounded bg-neutral-200 px-2 py-1 text-sm font-semibold">{r.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
