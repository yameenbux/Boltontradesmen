import type { Metadata, Viewport } from "next";
import { Figtree, Gloock } from "next/font/google";
import "./globals.css";
import { BrandBar } from "@/components/BrandBar";
import { SiteFooter } from "@/components/SiteFooter";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const display = Gloock({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const body = Figtree({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bolton Vouched",
  description: "Local people, vouched for by Bolton.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5EEE3" },
    { media: "(prefers-color-scheme: dark)", color: "#161009" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The head script may add data-theme before hydration, so React must not treat it as a mismatch.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Static string, no user input: applies a stored light/dark choice before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <div className="app min-h-dvh">
          <BrandBar />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
