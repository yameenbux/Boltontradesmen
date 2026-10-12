import type { MetadataRoute } from "next";

// Installs the live directory (/platform) to the Home Screen; the showcase site at "/" stays outside the app's scope.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/platform",
    name: "Bolton Vouched",
    short_name: "Vouched",
    description: "Local people, vouched for by Bolton.",
    lang: "en-GB",
    dir: "ltr",
    start_url: "/platform",
    scope: "/platform",
    display: "standalone",
    background_color: "#F5EEE3",
    theme_color: "#9C3A25",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
