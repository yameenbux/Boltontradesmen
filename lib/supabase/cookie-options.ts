// Supabase's session cookies, as the server sets them. Nothing in the browser reads the session (every Supabase call
// happens on the server), so the cookies are HttpOnly: a script injected into a page can't steal someone's sign-in.
// Secure wherever the site is served over https.
export function sessionCookieOptions(env: Record<string, string | undefined> = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
    path: "/",
  };
}
