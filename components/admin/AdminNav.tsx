"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Counts = { under_check: number; open_flags: number; pending_proofs: number };

/** The admin's sections, with how many items wait in each queue. */
export function AdminNav({ counts }: { counts: Counts | null }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Providers", n: 0, current: path === "/admin" || path.startsWith("/admin/providers") },
    { href: "/admin/reviews", label: "Reviews", n: counts?.under_check ?? 0 },
    { href: "/admin/flags", label: "Flags", n: counts?.open_flags ?? 0 },
    { href: "/admin/proofs", label: "Proofs", n: counts?.pending_proofs ?? 0 },
  ];
  return (
    <nav aria-label="Admin" className="admin-nav">
      {items.map((i) => {
        const current = i.current ?? path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className="chip press" aria-current={current ? "page" : undefined}>
            {i.label}
            {i.n > 0 && <em aria-label={`${i.n} waiting`}>{i.n}</em>}
          </Link>
        );
      })}
    </nav>
  );
}
