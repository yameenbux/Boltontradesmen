import type { Metadata, Viewport } from "next";
import { Figtree, Gloock } from "next/font/google";
import "./globals.css";
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

// viewport-fit=cover lets the installed app draw edge to edge; the CSS pads with env(safe-area-inset-*).
// Theme colour is brick, matching the manifest, so the installed app's status bar wears the brand.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#9C3A25" },
    { media: "(prefers-color-scheme: dark)", color: "#6E2818" },
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
      {/* Bare on purpose: each section (platform, admin, policies, showcase) brings its own chrome. */}
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
