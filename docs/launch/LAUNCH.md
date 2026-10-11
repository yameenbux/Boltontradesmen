# Bolton Vouched — launch morning

Everything runs on brand-new, separate accounts/projects:

- **Database:** Supabase project **"Bolton Vouched"** (`mmarznvndvbwyhhtbfjy`, London). Nothing shared with Taiyabah, MasjidOne or any other project.
- **Hosting:** Railway project **"Bolton Vouched"** (service `web`), deploying automatically from the `main` branch on GitHub.
- **Temporary address (works now):** https://web-production-0ec9b.up.railway.app
- **Your address:** https://boltonvouched.ysbdesigns.uk (works once step 2 below is done)
  - **The directory (the app people add to their Home Screen):** https://boltonvouched.ysbdesigns.uk/platform
  - **Admin:** https://boltonvouched.ysbdesigns.uk/admin
  - Old-style links (`/c/…`, `/p/…`, `/consent/…`) still work: they forward to the `/platform/…` address.

---

## Step 1 — Paste the secret key into Railway (2 minutes)

The Call/WhatsApp buttons and the consent page need Supabase's secret key, which only you can copy.

1. Supabase → project **Bolton Vouched** → **Project Settings → API Keys** → copy the **service_role** key (legacy tab) — or create a **Secret key**.
2. Railway → project **Bolton Vouched** → service **web** → **Variables** → set `SUPABASE_SERVICE_ROLE_KEY` to that value (replace `PASTE-SERVICE-ROLE-KEY-FROM-SUPABASE`). Railway redeploys by itself.

Never put this key anywhere else.

## Step 2 — Point boltonvouched.ysbdesigns.uk at Railway (5 minutes)

At whoever hosts the DNS for **ysbdesigns.uk**:

| Type | Name / Host | Value |
|---|---|---|
| CNAME | `boltonvouched` | `31j7frao.up.railway.app` |
| TXT | `_railway-verify.boltonvouched` | `railway-verify=422d1dc66d31559fd80b00c45c4061796d753e0032be83d1b4bd996db048b9ef` |

The CNAME currently points at `yameenbux.github.io` (GitHub Pages) — **replace** it. Then in GitHub → repo **Settings → Pages**, remove the custom domain / turn Pages off (the app can't run on Pages).

When Railway shows the domain as active (usually minutes, up to an hour), change one Railway variable:
`NEXT_PUBLIC_SITE_URL` → `https://boltonvouched.ysbdesigns.uk`
(this is the address used in consent links you copy from admin).

## Step 3 — Two clicks in Supabase

1. **Authentication → Sign In / Providers → "Allow new users to sign up" → OFF.** Only you should have an account.
2. **SQL Editor → New query →** paste the whole of `docs/launch/finish-admin-function.sql` → **Run**. This lets admin *remove* a category from a provider (adding already works). It shows a "destructive operation" warning because the function contains a `delete` — that's expected; confirm.

## Step 4 — Sign in and add traders

- Go to `/admin` on the site (e.g. https://boltonvouched.ysbdesigns.uk/admin).
- Email: **yameen@ysbdesigns.uk** · Password: sent to you in the chat (not stored in this repo).
- **Add provider** → name, business, trade(s), areas, mobile, WhatsApp → Save. They start as **invited**.
- Gas & boilers needs a Gas Safe check recorded first (number + expiry); driving instructors need a DVSA ADI check.
- **Copy consent link** → send it with message A below.
- When they tap **"I agree, list me"**, their status becomes **consented** → open them in admin → **Set live**. They appear on the site within 5 minutes.

## Step 5 — Messages

### A. To each trader, one-to-one (consent first)

> Alright [Name], it's Yameen from the Bolton Tradesmen group.
>
> I've launched Bolton Vouched, a free directory for the group so people can find you and contact you straight away. I'd like to list you.
>
> This link shows exactly how you'll appear (name, trade, areas and Call/WhatsApp buttons; your number isn't shown on the page). If you're happy, tap "I agree":
> [CONSENT LINK]
>
> Fair warning: people who've used you will be able to leave reviews, and I won't remove one just because it's unflattering, only if it's fake or abusive. You can reply to any review, and you can come off any time.
>
> Free, no catch. Any questions just message me.

### B. To each trader once they're live

> You're live on Bolton Vouched, [Name] 👍
>
> Your page: [PROFILE LINK — e.g. https://boltonvouched.ysbdesigns.uk/platform/p/ace-plumbing]
>
> People can now find you and ring or WhatsApp you straight from it. Your place in the list comes from reviews only; nobody can pay to jump ahead. Reviews are coming soon, so it's worth sharing your link with happy customers.
>
> If anything on your listing needs changing, just drop me a message.

### C. To the WhatsApp group

> Morning all 👋
>
> Every week someone in here asks "anyone know a good…?" and the answers get lost in the scroll. So I've built **Bolton Vouched**, a home for the people this group recommends:
>
> 👉 https://boltonvouched.ysbdesigns.uk/platform
>
> • Find plumbers, electricians, caterers, bouncy castles, man & van and more
> • Tap Call or WhatsApp straight from their page, no sign-up
> • Every pro on there has agreed to be listed, and nobody can pay to rank higher
> • Reviews from people in Bolton are coming soon
> • Tip: open the link, then "Add to Home Screen" and it works like an app
>
> **Traders in the group:** if you'd like to be added (it's free), just drop me a message with your name, trade and the areas you cover and I'll get you on.
>
> It's brand new, so tell me what you think. Still ask in here as normal, I'll keep adding the people you recommend.

Send C only once at least a handful of traders are live, so the first visit doesn't look empty.

---

## What's live vs coming

- **Live:** directory, categories, provider profiles, Call/WhatsApp (counted as enquiries), consent links, admin.
- **Coming (Plan 2):** resident sign-in and reviews, community questions, trader dashboards and the paid Verified tier.
- Before wider promotion: solicitor review of the draft policy pages (they show "Draft — pending legal review"), and ICO registration for YSB Ventures Ltd.
