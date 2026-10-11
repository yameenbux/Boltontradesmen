"use client";

import { useLayoutEffect, useRef } from "react";

const DURATION_MS = 900;

/**
 * A number that counts up from 0 to `to` when it mounts (ease-out cubic, as in the prototype).
 * The server HTML and the first paint always show the real number, so with JavaScript off or
 * `prefers-reduced-motion: reduce` it is never stuck at 0. The DOM is updated directly (no re-renders).
 */
export function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || to === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / DURATION_MS);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    el.textContent = "0";
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(to);
    };
  }, [to]);

  return (
    <span ref={ref} className="countup">
      {to}
    </span>
  );
}
