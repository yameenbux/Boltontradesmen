"use client";

import { useLayoutEffect } from "react";
import { THEME_STORAGE_KEY, isTheme, type Theme } from "@/lib/theme";

function readStored(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(t) ? t : null;
  } catch {
    return null;
  }
}

// Header button that flips light/dark. The <head> script in app/layout.tsx applies the stored choice before paint;
// with nothing stored the theme follows the system (prefers-color-scheme).
export function ThemeToggle() {
  // Dev Strict Mode remounts <html> and drops the attribute the head script set; re-apply it. No-op in production.
  useLayoutEffect(() => {
    const t = readStored();
    if (t) document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const dark = isTheme(current) ? current === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next: Theme = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode etc.): the choice still applies for this page view.
    }
  }

  return (
    <button type="button" className="icon-btn press" aria-label="Switch light or dark" onClick={toggle}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}
