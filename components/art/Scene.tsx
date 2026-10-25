import type { ReactNode } from "react";
import { BoltonSkyline } from "@/components/art/BoltonSkyline";

// The cinematic band at the top of a marketing page: dusk sky (night in dark mode), a low sun, the skyline along the
// bottom, and the page's own heading, search or buttons on top. Content first in the markup; the art sits behind it.
export function Scene({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy: string }) {
  return (
    <section className={["scene", className].filter(Boolean).join(" ")} aria-labelledby={labelledBy}>
      <div className="scene-body">{children}</div>
      <span className="scene-sun" aria-hidden="true" />
      <BoltonSkyline />
    </section>
  );
}
