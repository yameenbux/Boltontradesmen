import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/app/admin/login/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-3">
        <Link href="/admin" className="inline-flex min-h-12 items-center text-lg font-extrabold">
          Admin
        </Link>
        <form action={signOut} className="flex items-center gap-3">
          <span className="text-sm text-neutral-700">{user.email}</span>
          <button type="submit" className="min-h-12 rounded border border-neutral-500 px-4 font-semibold">
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
