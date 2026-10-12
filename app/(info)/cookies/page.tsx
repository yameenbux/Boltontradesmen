import type { Metadata } from "next";
import { H2, PolicyPage } from "@/components/PolicyPage";
import { draftKey } from "@/lib/review-draft";
import { pageMetadata } from "@/lib/seo";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = pageMetadata({
  title: "Cookies | Bolton Vouched",
  description:
    "Why Bolton Vouched has no cookie banner: browsing sets no cookies, and signing in only sets the cookies needed to keep you signed in.",
  path: "/cookies",
});

// The review draft's key, as stored: "bv-review-draft:" followed by the provider's page name.
const DRAFT_KEY = draftKey("…");

const COOKIES = [
  {
    name: "sb-…-auth-token (sometimes split into …-auth-token.0, .1)",
    purpose: "Keeps you signed in, so you can leave or reply to reviews and use your account page.",
    lasts: "Until you sign out or delete your account. Your browser keeps it for at most 400 days.",
  },
  {
    name: "sb-…-auth-token-code-verifier",
    purpose: "Only while you sign in with Google: a one-time check that the sign-in you finish is the one you started.",
    lasts: "Until Google sends you back to us, when it's used and deleted.",
  },
];

export default function CookiesPage() {
  return (
    <PolicyPage title="Cookies">
      <p>
        Bolton Vouched doesn&apos;t show a cookie banner because it doesn&apos;t need one. UK law (the Privacy and
        Electronic Communications Regulations) asks for your consent before a site stores things on your device, except
        when they are strictly necessary for a service you asked for. Everything this site stores is in that group.
      </p>

      <H2>Just looking</H2>
      <p>
        If you browse the site, look at listings or tap Call or WhatsApp, we set no cookies at all. There is no
        advertising and no tracking across other sites.
      </p>

      <H2>Signing in</H2>
      <p>
        When you sign in (to leave a review, reply as a provider, or as the admin), our sign-in provider, Supabase, sets
        the cookies below on this site. They are strictly necessary: without them you can&apos;t stay signed in. They
        are only set once you sign in, and only used for signing in.
      </p>
      <div className="policy-table" role="region" aria-label="Sign-in cookies" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">What it&apos;s for</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                </td>
                <td>{c.purpose}</td>
                <td>{c.lasts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>Things saved on your device</H2>
      <p>
        Two things are kept in your browser&apos;s own storage (local storage), never sent to us and never used to
        track you. Both are things you asked for:
      </p>
      <ul>
        <li>
          <code>{THEME_STORAGE_KEY}</code>: whether you chose the light or dark look. It stays until you clear your
          browser&apos;s data.
        </li>
        <li>
          <code>{DRAFT_KEY}</code>: a review you&apos;ve started writing, so it isn&apos;t lost if the page reloads or
          your signal drops. It&apos;s cleared once the review is posted.
        </li>
      </ul>

      <H2>Security checks</H2>
      <p>
        On the sign-in page, the admin login and the Get listed form we use Cloudflare Turnstile to check that a person,
        not a script, is sending the form. To do that, Cloudflare may look at signals from your device and browser.
        Cloudflare handles that information under its own privacy policy, at cloudflare.com/privacypolicy. Turnstile is
        only used on those three forms.
      </p>

      <H2>Counting visits</H2>
      <p>
        If it&apos;s switched on, we use Cloudflare Web Analytics to count page views. It sets no cookies, doesn&apos;t
        build a profile of you and doesn&apos;t follow you to other sites. We see totals, such as how many times a page
        was viewed, not who viewed it. It&apos;s not used on the admin pages.
      </p>

      <H2>Questions</H2>
      <p>
        The <a href="/privacy">privacy notice</a> explains what personal information we keep and why.
      </p>
    </PolicyPage>
  );
}
