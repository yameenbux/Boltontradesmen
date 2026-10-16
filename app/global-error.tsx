"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

// Last resort when the root layout itself fails: it replaces the whole document, so no globals.css, fonts or chrome.
// Inline styles only, in the brand colours, following the system light/dark setting.
const CSS = `
  :root{color-scheme:light dark; --bg:#F5EEE3; --ink:#231A15; --ink-2:#6B5D53; --brick:#9C3A25; --on-brick:#FFF5E9}
  @media (prefers-color-scheme: dark){:root{--bg:#161009; --ink:#F3E9DC; --ink-2:#BBA998; --brick:#C4553B}}
  body{margin:0; min-height:100dvh; display:grid; place-items:center; background:var(--bg); color:var(--ink);
    font:17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:420px; padding:32px 16px; display:grid; gap:14px; justify-items:start}
  h1{margin:0; font-size:34px; line-height:1.1}
  p{margin:0; color:var(--ink-2)}
  .row{display:flex; flex-wrap:wrap; gap:10px}
  button,a.btn{min-height:52px; padding:0 20px; border-radius:16px; font:inherit; font-weight:700; cursor:pointer;
    display:inline-flex; align-items:center; text-decoration:none}
  button{border:0; background:var(--brick); color:var(--on-brick)}
  a.btn{border:2px solid currentColor; color:var(--ink)}
`;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-GB">
      <head>
        <title>Something went wrong | Bolton Vouched</title>
        <meta name="robots" content="noindex" />
        <style>{CSS}</style>
      </head>
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>Bolton Vouched didn&rsquo;t load properly. It&rsquo;s usually a blip, so try again in a moment.</p>
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            {/* A plain link on purpose: a full page load starts the app afresh. */}
            <a className="btn" href="/platform">
              Browse trades
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
