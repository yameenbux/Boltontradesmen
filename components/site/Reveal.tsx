"use client";

import { useEffect } from "react";

// Scroll reveal for elements marked .reveal. The head script (app/(site)/layout.tsx) adds html.sr before first paint
// when JavaScript runs and motion is allowed; only then does CSS hide .reveal until this observer marks it .in.
// html.sr-ready tells the CSS fail-safe that the observer is running.
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      root.classList.remove("sr");
      return;
    }
    // Arrived by client-side navigation, so the head script did not run: switch reveal on now.
    root.classList.add("sr");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    root.classList.add("sr-ready");
    return () => {
      io.disconnect();
      root.classList.remove("sr", "sr-ready");
    };
  }, []);
  return null;
}
