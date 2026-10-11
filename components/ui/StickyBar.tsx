"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Bar fixed to the bottom of the viewport (`.actionbar`), sliding up on mount.
 *
 * The server renders it in place, so it works without JavaScript. Once hydrated it is portalled to <body>:
 * the route template.tsx files animate a transform on the route wrapper, and a transformed ancestor would make
 * position:fixed relative to the wrapper instead of the viewport while the enter animation runs.
 */
export function StickyBar({ label, children }: { label: string; children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const bar = (
    <section className={hydrated ? "actionbar" : "actionbar actionbar-ssr"} aria-label={label}>
      {children}
    </section>
  );
  return hydrated ? createPortal(bar, document.body) : bar;
}
