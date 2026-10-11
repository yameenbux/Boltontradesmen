import type { Metadata } from "next";
import { PlatformChrome } from "@/components/PlatformChrome";

// Home-screen app metadata: the manifest (app/manifest.ts) installs /platform, these cover iOS Safari.
export const metadata: Metadata = {
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, title: "Vouched", statusBarStyle: "default" },
  // Next emits the newer mobile-web-app-capable; older iOS versions still read the apple- prefixed tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformChrome>{children}</PlatformChrome>;
}
