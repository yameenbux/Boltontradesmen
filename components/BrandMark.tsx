import { BRAND_MARK } from "@/lib/brand-mark";

// The house-and-tick mark inside the brick tile (header, showcase nav and footer). Decorative: the link names the brand.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={BRAND_MARK.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={BRAND_MARK.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {BRAND_MARK.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
