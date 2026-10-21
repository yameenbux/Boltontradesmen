"use client";

import { useEffect, useState } from "react";
import { greeting } from "@/lib/greeting";

// The sign-in cookie is HttpOnly (lib/supabase/cookie-options.ts), so the page can't tell who's signed in: it asks
// /api/me, which answers with the first name or nothing (without a session that's quick: no database call).

/** "Good afternoon, Yameen" above the headline for signed-in people; nothing for everyone else. */
export function Greeting() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
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
