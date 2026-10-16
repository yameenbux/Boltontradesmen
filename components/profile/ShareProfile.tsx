"use client";

import { useEffect, useId, useRef, useState } from "react";

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ShareIcon = () => (
  <svg {...svg}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

const ChatIcon = () => (
  <svg {...svg}>
    <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z" />
  </svg>
);

const CopyIcon = () => (
  <svg {...svg}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

/**
 * Share button in the profile header. Uses the phone's own share sheet (Web Share API) where there is one; otherwise
 * opens a small menu with Share on WhatsApp and Copy link. Everything is built on the server (lib/share.ts) and
 * nothing is recorded: no cookies, no tracking.
 */
export function ShareProfile({ url, title, whatsapp }: { url: string; title: string; whatsapp: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        // Closing the share sheet is not an error; anything else falls back to the menu.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setCopied(null);
    setOpen((o) => !o);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied.");
    } catch {
      setCopied(`Copy this link: ${url}`);
    }
  }

  return (
    <div className="share-prof" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="share-prof-btn press"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={share}
      >
        <ShareIcon />
        Share
      </button>
      {open && (
        <div className="share-menu" id={menuId} role="group" aria-label="Share this page">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <ChatIcon />
            Share on WhatsApp
          </a>
          <button type="button" onClick={copy}>
            <CopyIcon />
            Copy link
          </button>
          {copied && (
            <p role="status" className="share-copied">
              {copied}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
