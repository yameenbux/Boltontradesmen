import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/app/admin/login/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="admin-wide flex w-full flex-col gap-5 py-2">
      <nav className="admin-bar">
        <Link href="/admin" className="a-link text-lg">
          Admin
        </Link>
        <form action={signOut} className="flex items-center gap-3">
          <span className="who">{user.email}</span>
          <Button type="submit" variant="secondary" className="min-h-12 px-4 text-base">
            Sign out
          </Button>
        </form>
      </nav>
      {children}
    </div>
  );
}
