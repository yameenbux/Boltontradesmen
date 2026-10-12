import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/app/admin/login/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireAdmin();
  const { data: counts, error } = await supabase.rpc("admin_counts");
  if (error) console.error("admin: admin_counts failed:", error.message);
  return (
    <div className="admin-wide flex w-full flex-col gap-5 py-2">
      <div className="admin-bar">
        <Link href="/admin" className="a-link text-lg">
          Admin
        </Link>
        <form action={signOut} className="flex items-center gap-3">
          <span className="who">{user.email}</span>
          <Button type="submit" variant="secondary" className="min-h-12 px-4 text-base">
            Sign out
          </Button>
        </form>
      </div>
      <AdminNav counts={error ? null : counts} />
      {children}
    </div>
  );
}
