import { PlatformChrome } from "@/components/PlatformChrome";

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return <PlatformChrome>{children}</PlatformChrome>;
}
