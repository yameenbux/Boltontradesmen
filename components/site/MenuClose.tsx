"use client";

import { useEffect } from "react";

// Closes the phone menu (a <details>) after a link in it is tapped, or on Escape / a tap outside it.
export function MenuClose() {
  useEffect(() => {
    const menus = () => document.querySelectorAll<HTMLDetailsElement>("details.s-menu[open]");
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      menus().forEach((m) => {
        if (!m.contains(t) || t.closest("a")) m.open = false;
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      menus().forEach((m) => {
        m.open = false;
        m.querySelector("summary")?.focus();
      });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
