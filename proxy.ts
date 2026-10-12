import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes Supabase session cookies on the signed-in routes only (admin, sign-in, welcome, account, review form,
// report, provider area), so public pages stay cookie-free and cacheable. This is not authorisation: every page and
// server action checks the user itself (lib/admin.ts, lib/auth.ts).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );
  await supabase.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/platform/sign-in",
    "/platform/welcome",
    "/platform/account/:path*",
    "/platform/p/:slug/review",
    "/platform/report/:path*",
    "/platform/provider/:path*",
  ],
};
