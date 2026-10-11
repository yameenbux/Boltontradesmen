import { PlatformChrome } from "@/components/PlatformChrome";

// Policy pages (/privacy, /terms, /how-ratings-work) stay at the root URL but share the platform chrome.
export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return <PlatformChrome>{children}</PlatformChrome>;
}
