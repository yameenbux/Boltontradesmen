"use client";

import { useEffect } from "react";
import { arrivalSource, type ViewKind } from "@/lib/page-views";

/** Sends one view to app/api/view. Never throws: counting must never break the page. */
function sendView(kind: ViewKind, slug: string) {
  const body = JSON.stringify({ kind, slug });
  try {
    if (!navigator.sendBeacon?.("/api/view", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/view", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Counting a view must never break the page.
  }
}

/**
 * Counts this page view (app/api/view): once per page load, after the page has shown. No cookie and nothing stored in
 * the browser; the server keeps a count per page per day.
 */
export function ViewBeacon({ kind, slug }: { kind: ViewKind; slug: string }) {
  useEffect(() => sendView(kind, slug), [kind, slug]);
  return null;
}

/**
 * Counts an arrival from Facebook, Instagram or WhatsApp (migration 000057), on whichever page the visitor lands. In
 * the root layout, so it runs once per visit: moving between pages inside the site doesn't remount it. Nothing is
 * stored in the browser.
 */
export function ArrivalBeacon() {
  useEffect(() => {
    const source = arrivalSource(window.location.search, document.referrer);
    if (source) sendView("arrival", source);
  }, []);
  return null;
}
