import { NextResponse, type NextRequest } from "next/server";
import { googleCallbackPath } from "@/lib/google-callback";
import { createServerAuthClient } from "@/lib/supabase/server";

// Back from Google (via Supabase): swap the one-time code for a session cookie (PKCE; the verifier cookie was
// set by startGoogleSignIn), then send the person on. The redirect is built on NEXT_PUBLIC_SITE_URL, never the
// request's Host header.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const supabase = await createServerAuthClient();
  const path = await googleCallbackPath(
    { code: params.get("code"), error: params.get("error"), next: params.get("next") },
    {
      exchange: async (code) => {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("google sign-in: exchange refused:", error.message);
        return !error && !!data.session;
      },
      account: async () => {
        const { data, error } = await supabase.rpc("my_account");
        if (error) throw new Error(`my_account failed: ${error.message}`);
        return data as { display_name: string | null; deleted: boolean } | null;
      },
    },
  );
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) throw new Error("NEXT_PUBLIC_SITE_URL must be set");
  const response = NextResponse.redirect(new URL(path, site), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
