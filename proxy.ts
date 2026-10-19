import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessToken,
  grantsAccess,
  hasAccess,
  isOpenPath,
  LOCK_COOKIE,
  LOCK_MAX_AGE,
  LOCK_PATH,
  lockPassword,
} from "@/lib/site-lock";

// Two jobs.
// 1. The pre-launch lock (lib/site-lock.ts): while SITE_LOCK_PASSWORD is set, every page asks for it first and
//    nothing is indexed. Off, this does nothing at all.
// 2. Refreshes Supabase session cookies on the signed-in routes only (admin, sign-in, the Google callback, welcome,
//    account, review form, report, provider area, trader sign-in links, and asking, answering and reporting community
//    questions), so public pages stay cookie-free and cacheable. This is not authorisation: every page and server
//    action checks the user itself (lib/admin.ts, lib/auth.ts).

const SESSION_PATHS = [
  /^\/admin(\/|$)/,
  /^\/sign-in$/,
  /^\/welcome$/,
  /^\/account(\/|$)/,
  /^\/p\/[^/]+\/review$/,
  /^\/report(\/|$)/,
  /^\/provider(\/|$)/,
  /^\/auth\/callback$/,
  /^\/link(\/|$)/,
  /^\/ask\/new$/,
  /^\/ask\/[^/]+\/(answer|report)$/,
];

async function withSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  let res = response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          const next = NextResponse.next({ request });
          for (const c of res.cookies.getAll()) next.cookies.set(c);
          res.headers.forEach((v, k) => next.headers.set(k, v));
          res = next;
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    },
  );
  await supabase.auth.getUser();
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const password = lockPassword();
  const response = NextResponse.next({ request });

  if (password && !isOpenPath(path)) {
    const ok = hasAccess(request.cookies.get(LOCK_COOKIE)?.value, password);
    if (!ok && !grantsAccess(path)) {
      const to = new URL(LOCK_PATH, request.url);
      to.searchParams.set("next", path + request.nextUrl.search);
      const r = NextResponse.redirect(to, 303);
      r.headers.set("X-Robots-Tag", "noindex, nofollow");
      r.headers.set("Cache-Control", "private, no-store");
      return r;
    }
    if (!ok) {
      response.cookies.set(LOCK_COOKIE, accessToken(password), {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: LOCK_MAX_AGE,
      });
    }
  }
  if (password) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    // Locked pages differ per visitor (in or not): never cache them in shared caches.
    response.headers.set("Cache-Control", "private, no-store");
  }

  if (SESSION_PATHS.some((re) => re.test(path))) return withSession(request, response);
  return response;
}

export const config = {
  // Everything but Next's own build files and images (static files in public/ are checked by isOpenPath).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
