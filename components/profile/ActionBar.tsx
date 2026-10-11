"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z" />
  </svg>
);

const noop = () => () => {};

/**
 * Sticky contact bar at the bottom of the viewport. Links are plain `<a rel="nofollow">` to /api/contact
 * (prefetchers and crawlers must not log enquiries; no phone number ever reaches the page).
 *
 * The server renders it in place, so it works without JavaScript. Once hydrated it is portalled to <body>:
 * app/template.tsx animates a transform on the route wrapper, and a transformed ancestor would make
 * position:fixed relative to the wrapper instead of the viewport while the enter animation runs.
 */
export function ActionBar({
  slug,
  businessName,
  contactFirstName,
  hasWhatsapp,
}: {
  slug: string;
  businessName: string;
  contactFirstName: string | null;
  hasWhatsapp: boolean;
}) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const bar = (
    <section className={hydrated ? "actionbar" : "actionbar actionbar-ssr"} aria-label={`Contact ${businessName}`}>
      <div className={hasWhatsapp ? "inner" : "inner one"}>
        <Button href={`/api/contact/${slug}?via=call`} rel="nofollow" variant="primary">
          <PhoneIcon />
          {contactFirstName ? `Call ${contactFirstName}` : "Call"}
        </Button>
        {hasWhatsapp && (
          <Button href={`/api/contact/${slug}?via=whatsapp`} rel="nofollow" variant="secondary">
            <ChatIcon />
            WhatsApp
          </Button>
        )}
      </div>
    </section>
  );
  return hydrated ? createPortal(bar, document.body) : bar;
}
