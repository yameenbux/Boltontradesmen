import { Analytics } from "@/components/Analytics";
import { BrandBar } from "@/components/BrandBar";
import { SiteFooter } from "@/components/SiteFooter";

// The directory's frame (phone-width column, brand bar, footer). Used by the platform, admin, policy and 404 pages;
// the root layout stays bare so each section can bring its own chrome. Admin passes analytics={false}.
export function PlatformChrome({ children, analytics = true }: { children: React.ReactNode; analytics?: boolean }) {
  return (
    <div className="app min-h-dvh">
      <BrandBar />
      {children}
      <SiteFooter />
      {analytics && <Analytics />}
    </div>
  );
}
