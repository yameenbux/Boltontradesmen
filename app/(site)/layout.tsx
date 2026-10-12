import type { Metadata, Viewport } from "next";
import "./site.css";
import { MenuClose } from "@/components/site/MenuClose";
import { Reveal } from "@/components/site/Reveal";
import { ShowcaseFooter } from "@/components/site/ShowcaseFooter";
import { SiteNav } from "@/components/site/SiteNav";

const TITLE = "Bolton Vouched · Who's good round here?";
const DESCRIPTION =
  "Anyone know a good…? Bolton already does. The local trades and services the group recommends, in one place. Free, no sign-up to look.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Bolton Vouched",
    locale: "en_GB",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/social.png",
        width: 1200,
        height: 630,
        alt: "Bolton Vouched: Anyone know a good…? Bolton already does.",
      },
    ],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/social.png"] },
};

// The showcase is always dark, so the browser chrome matches it in either system theme.
export const viewport: Viewport = { themeColor: "#150F0C" };

// Static string, no user input: turns scroll reveal on before first paint, only when JavaScript runs and motion is
// allowed. Without it (no JavaScript, reduced motion) nothing is ever hidden.
const REVEAL_INIT =
  "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window)document.documentElement.classList.add('sr')}catch(e){}";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <script dangerouslySetInnerHTML={{ __html: REVEAL_INIT }} />
      <div className="s-backdrop" aria-hidden="true">
        <span className="s-glow s-glow-a" />
        <span className="s-glow s-glow-b" />
      </div>
      <SiteNav />
      {children}
      <ShowcaseFooter />
      <Reveal />
      <MenuClose />
    </div>
  );
}
