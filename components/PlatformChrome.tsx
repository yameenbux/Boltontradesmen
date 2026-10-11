import { BrandBar } from "@/components/BrandBar";
import { SiteFooter } from "@/components/SiteFooter";

// The directory's frame (phone-width column, brand bar, footer). Used by the platform, admin, policy and 404 pages;
// the root layout stays bare so the showcase site at "/" can bring its own chrome.
export function PlatformChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="app min-h-dvh">
      <BrandBar />
      {children}
      <SiteFooter />
    </div>
  );
}
