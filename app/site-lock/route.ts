import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom } from "@/lib/client-ip";
import { ipHash } from "@/lib/ip-hash";
import { rateAllow } from "@/lib/rate-limit";
import {
  accessToken,
  LOCK_COOKIE,
  LOCK_MAX_AGE,
  LOCK_PATH,
  lockPassword,
  passwordMatches,
  safeReturn,
} from "@/lib/site-lock";

// The pre-launch password page (lib/site-lock.ts). A route handler, not a page: it stands alone (no layout, no
// session) so it works whatever else is down. When the site is open it just sends people home. Wrong guesses are
// limited per connection in the database; if that can't be reached, the password check still runs.

export const dynamic = "force-dynamic";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(next: string, wrong: boolean): NextResponse {
  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Coming soon | Bolton Vouched</title>
<style>
:root{--bg:#F5EEE3;--surface:#FFFBF5;--ink:#231A15;--ink-2:#6B5D53;--line:#E4D6C5;--brick:#9C3A25;--on-brick:#FFF5E9;--err:#9C3A25}
@media (prefers-color-scheme:dark){:root{--bg:#161009;--surface:#211812;--ink:#F3E9DC;--ink-2:#BBA998;--line:#3A2B22;--brick:#D9704F;--on-brick:#1B0F0A;--err:#E8957A}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:28px 22px;display:grid;gap:16px}
.eyebrow{margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--brick)}
h1{margin:0;font-family:Georgia,"Iowan Old Style",serif;font-size:32px;line-height:1.1}
p{margin:0;color:var(--ink-2)}
label{display:grid;gap:6px;font-weight:700}
input{font:inherit;min-height:52px;padding:0 14px;border:1.5px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink)}
input:focus-visible,button:focus-visible{outline:3px solid var(--brick);outline-offset:2px}
button{font:inherit;font-weight:700;min-height:52px;border:0;border-radius:14px;background:var(--brick);color:var(--on-brick);cursor:pointer}
.err{color:var(--err);font-weight:600}
</style>
</head>
<body>
<main>
<p class="eyebrow">Bolton Vouched</p>
<h1>Coming soon</h1>
<p>Bolton's directory of trades vouched for by locals is getting ready. If you've been given early access, enter the password.</p>
<form method="post" action="${LOCK_PATH}">
<input type="hidden" name="next" value="${escape(next)}">
<label>Password<input name="password" type="password" autocomplete="current-password" required autofocus${
    wrong ? ' aria-invalid="true" aria-describedby="err"' : ""
  }></label>
${wrong ? '<p class="err" id="err" role="alert">That password isn\'t right.</p>' : ""}
<p style="margin-top:14px"><button type="submit" style="width:100%">Continue</button></p>
</form>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: wrong ? 401 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request: NextRequest) {
  const next = safeReturn(request.nextUrl.searchParams.get("next"));
  if (!lockPassword()) return NextResponse.redirect(new URL(next, request.url), 303);
  return page(next, false);
}

export async function POST(request: NextRequest) {
  const password = lockPassword();
  const fd = await request.formData();
  const next = safeReturn(typeof fd.get("next") === "string" ? (fd.get("next") as string) : null);
  if (!password) return NextResponse.redirect(new URL(next, request.url), 303);
  // 10 tries every 15 minutes per connection.
  if (!(await rateAllow("site-lock", ipHash(clientIpFrom(request.headers) || "unknown"), 10, 900, true))) {
    await new Promise((r) => setTimeout(r, 800));
    return page(next, true);
  }
  const given = fd.get("password");
  if (typeof given !== "string" || !passwordMatches(given, password)) {
    // Slows down guessing.
    await new Promise((r) => setTimeout(r, 800));
    return page(next, true);
  }
  const res = NextResponse.redirect(new URL(next, request.url), 303);
  res.cookies.set(LOCK_COOKIE, accessToken(password), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: LOCK_MAX_AGE,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
