"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const CodeIcon = () => (
  <svg {...svg}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </svg>
);

const DownloadIcon = () => (
  <svg {...svg}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14" />
  </svg>
);

/**
 * The "Vouched in Bolton" website badge (trader area and the admin's provider page): a live preview, the embed code
 * with Copy embed code, and downloads (PNG for Facebook, vans and print; SVG for designers). Everything is built on
 * the server (lib/share.ts badgeShare).
 */
export function WebsiteBadge({
  svg: svgPath,
  png,
  alt,
  embed,
  downloadName,
}: {
  svg: string;
  png: string;
  alt: string;
  embed: string;
  downloadName: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(embed);
      setCopied("Embed code copied. Paste it into your website's HTML.");
    } catch {
      setCopied("Couldn't copy. Select the code above and copy it.");
    }
  }

  return (
    <div className="web-badge">
      <div className="web-badge-preview">
        {/* A plain <img>, exactly as other sites will show it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgPath} alt={alt} width={240} height={80} data-testid="badge-preview" />
      </div>
      <label className="web-badge-code">
        <span>Embed code</span>
        <textarea readOnly rows={9} value={embed} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
      </label>
      <div className="share-actions">
        <Button type="button" onClick={copy}>
          <CodeIcon />
          Copy embed code
        </Button>
        <Button href={png} variant="secondary" download={`${downloadName}.png`}>
          <DownloadIcon />
          Download badge (PNG)
        </Button>
      </div>
      {copied && (
        <p role="status" className="share-copied">
          {copied}
        </p>
      )}
      <a href={svgPath} download={`${downloadName}.svg`} className="share-card-link">
        <DownloadIcon />
        Download as SVG
      </a>
    </div>
  );
}
