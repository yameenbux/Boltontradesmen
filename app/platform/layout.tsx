import type { Metadata } from "next";
import { PlatformChrome } from "@/components/PlatformChrome";

// Home-screen app metadata: the manifest (app/manifest.ts) installs /platform, these cover iOS Safari
// (the apple-touch-icon comes from the root layout).
export const metadata: Metadata = {
  appleWebApp: { capable: true, title: "Vouched", statusBarStyle: "default" },
  // Next emits the newer mobile-web-app-capable; older iOS versions still read the apple- prefixed tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformChrome>{children}</PlatformChrome>;
}
