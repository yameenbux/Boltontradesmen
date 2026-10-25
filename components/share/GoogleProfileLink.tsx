"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * "Put it on Google": the link for the Website box of the trader's Google Business Profile, with Copy and the steps.
 * Google doesn't allow links in a profile's description, so the Website box is the place. The link is built on the
 * server (lib/share.ts googleProfileLink).
 */
export function GoogleProfileLink({ link }: { link: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("Link copied. Paste it into the Website box on your Google profile.");
    } catch {
      setCopied(`Copy this link: ${link}`);
    }
  }

  return (
    <div className="share-review" data-testid="google-profile">
      <p className="share-link">
        <span>Website link for Google</span>
        <b data-testid="google-link">{link.replace(/^https?:\/\//, "")}</b>
      </p>
      <div className="share-actions">
        <Button type="button" onClick={copy}>
          Copy link for Google
        </Button>
      </div>
      {copied && (
        <p role="status" className="share-copied">
          {copied}
        </p>
      )}
      <ol className="google-steps">
        <li>
          On your phone, search Google for your business name, or open{" "}
          <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer">
            business.google.com
          </a>
          , signed in with the account that manages your profile.
        </li>
        <li>
          Tap <b>Edit profile</b>, then <b>Contact</b>.
        </li>
        <li>
          Paste the link into <b>Website</b> and tap <b>Save</b>. Google may take a few days to check it.
        </li>
      </ol>
      <p className="hint">
        No Google profile yet? It&apos;s free: create one at business.google.com so you show up on Google Maps, and
        add this link as your website.
      </p>
    </div>
  );
}
