"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The trader's review link with Copy link and Share on WhatsApp (in the trader area and on the admin's provider page).
 * The link and WhatsApp URL are built on the server (lib/review-link.ts); the message is neutral by rule.
 * Also used, without the card link, for the trader's own profile link ("Share your page", lib/share.ts).
 */
export function ShareReviewLink({
  link,
  display,
  whatsapp,
  cardHref,
  label = "Your review link",
  testId = "review-link",
}: {
  link: string;
  /** The link as printed: no https://. */
  display: string;
  /** wa.me share URL carrying the review request message. */
  whatsapp: string;
  /** The printable card page, when there is one. */
  cardHref?: string;
  label?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("Link copied. Paste it into a text or email.");
    } catch {
      setCopied(`Copy this link: ${link}`);
    }
  }

  return (
    <div className="share-review">
      <p className="share-link">
        <span>{label}</span>
        <b data-testid={testId}>{display}</b>
      </p>
      <div className="share-actions">
        <Button type="button" onClick={copy}>
          <CopyIcon />
          Copy link
        </Button>
        <Button href={whatsapp} variant="secondary" target="_blank" rel="noopener noreferrer">
          <ChatIcon />
          Share on WhatsApp
        </Button>
      </div>
      {copied && (
        <p role="status" className="share-copied">
          {copied}
        </p>
      )}
      {cardHref && (
        <a href={cardHref} className="share-card-link">
          <QrIcon />
          Print a review card with a QR code
        </a>
      )}
    </div>
  );
}

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CopyIcon() {
  return (
    <svg {...svg}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...svg}>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg {...svg}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </svg>
  );
}
