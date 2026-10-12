"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile widget (free), placed inside a form: it fills the hidden field "cf-turnstile-response", which
// the server checks (lib/turnstile.ts). Renders nothing when there's no site key (Turnstile off: local, CI).
// "interaction-only": most people never see it; it shows a checkbox only when Cloudflare wants one.
// A token works once, so the widget resets whenever `resetKey` changes (after each submit's answer).

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({ siteKey, resetKey }: { siteKey: string | null; resetKey?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const api = window.turnstile;
    if (!siteKey || !ready || !api || !box.current || widget.current) return;
    widget.current = api.render(box.current, {
      sitekey: siteKey,
      appearance: "interaction-only",
      "response-field-name": "cf-turnstile-response",
    });
    return () => {
      if (widget.current) api.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, ready]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={box} className="turnstile" data-testid="turnstile" />
    </>
  );
}
