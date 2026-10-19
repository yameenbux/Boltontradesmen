"use client";

import { useEffect, useState } from "react";
import { greeting } from "@/lib/greeting";

// Supabase's sign-in cookie (sb-<project>-auth-token, possibly split into .0/.1). Without it, nobody is signed in and
// the greeting doesn't ask the server at all.
const SIGNED_IN = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

/** "Good afternoon, Yameen" above the headline for signed-in people; nothing for everyone else. */
export function Greeting() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!SIGNED_IN.test(document.cookie)) return;
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { firstName?: string | null } | null) => {
        if (live && me?.firstName) setText(greeting(me.firstName));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!text) return null;
  return (
    <p className="greeting" data-testid="greeting">
      {text}
    </p>
  );
}
