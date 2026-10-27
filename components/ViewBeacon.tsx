"use client";

import { useEffect } from "react";
import type { ViewKind } from "@/lib/page-views";

/**
 * Counts this page view (app/api/view): once per page load, after the page has shown. No cookie and nothing stored in
 * the browser; the server keeps a count per page per day.
 */
export function ViewBeacon({ kind, slug }: { kind: ViewKind; slug: string }) {
  useEffect(() => {
    const body = JSON.stringify({ kind, slug });
    try {
      if (!navigator.sendBeacon?.("/api/view", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/view", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    } catch {
      // Counting a view must never break the page.
    }
  }, [kind, slug]);
  return null;
}
