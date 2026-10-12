// The Bolton Vouched mark: a house roofline with a tick inside (local trades and services, vouched for).
// Line art on a 24x24 grid, drawn in cream on the brick tile. One source for the header tiles (components/BrandMark.tsx)
// and the generated images (scripts/make-icons.mjs, scripts/shots.mjs import this file directly with Node's type stripping),
// so keep it free of imports and TypeScript-only syntax beyond `as const`.
export const BRAND_MARK = {
  viewBox: "0 0 24 24",
  strokeWidth: 2.2,
  paths: [
    "M3 11.5 12 4l9 7.5", // roof
    "M5.5 9.6V20h13V9.6", // walls
    "m8.6 14.6 2.4 2.4 4.4-4.6", // tick
  ],
} as const;

/** The mark as a standalone SVG string (for the icon and social-image scripts). */
export function brandMarkSvg(color: string, size: number | string = "100%"): string {
  const paths = BRAND_MARK.paths.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_MARK.viewBox}" width="${size}" height="${size}" fill="none" ` +
    `stroke="${color}" stroke-width="${BRAND_MARK.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}
