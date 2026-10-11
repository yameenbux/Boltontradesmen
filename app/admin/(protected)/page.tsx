import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const STATUS_TONE = { invited: "gold", consented: "outline", live: "sage", paused: "muted", removed: "muted" } as const;

type Row = { id: string; business_name: string; phone_e164: string; status: string; categories: string[] };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_providers");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return (
    <main className="flex flex-col gap-5">
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
    </main>
  );
}
