import "server-only";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";

// Who tapped Call or WhatsApp, when they're signed in, so the trader's own taps and the admin's are left out of the
// enquiry count (migration 000029). Reads the session cookie the browser already sends with the tap; never writes a
// cookie (setAll does nothing) and never stops the redirect: with no session, or on any error, it's null. Profile
// pages stay cookie-free: only the /api/contact redirect reads this.
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export async function tapActor(cookieHeader: string | null): Promise<string | null> {
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader).map(({ name, value }) => ({ name, value: value ?? "" }));
  if (!cookies.some((c) => SESSION_COOKIE.test(c.name))) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createServerClient(url, key, {
      cookies: { getAll: () => cookies, setAll: () => {} },
      auth: { autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch (err) {
    console.error("tap actor lookup failed; logging the tap without one", err);
    return null;
  }
}
