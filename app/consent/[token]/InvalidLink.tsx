import type { Ref } from "react";

/** Shown for a malformed, unknown, used or rotated consent link (and when consent is unavailable). */
export function InvalidLink({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div className="lost">
      <p className="eyebrow m-0">Your listing</p>
      <h1 className="display" ref={headingRef} tabIndex={-1}>
        This link is no longer valid
      </h1>
      <p>It may have been used already, or replaced by a newer one. Please ask us for a new link.</p>
    </div>
  );
}
