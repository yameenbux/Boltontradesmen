import type { Metadata } from "next";
import { PlatformChrome } from "@/components/PlatformChrome";

// Nothing under /admin belongs in search results (robots.txt also disallows it).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  // No page analytics in the admin area.
  return <PlatformChrome analytics={false}>{children}</PlatformChrome>;
}
