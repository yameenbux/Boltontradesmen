# Bolton Vouched — launch morning

Everything runs on brand-new, separate accounts/projects:

- **Database:** Supabase project **"Bolton Vouched"** (`mmarznvndvbwyhhtbfjy`, London). Nothing shared with Taiyabah, MasjidOne or any other project.
- **Hosting:** Railway project **"Bolton Vouched"** (service `web`), deploying automatically from the `main` branch on GitHub.
- **Temporary address (works now):** https://web-production-0ec9b.up.railway.app
- **Your address:** https://boltonvouched.ysbdesigns.uk (works once step 2 below is done)
  - **The front page (the link to share):** https://boltonvouched.ysbdesigns.uk shows what Bolton Vouched is, how to add it to a phone, how traders get listed, and the FAQ. Its preview image in WhatsApp is `public/social.png`.
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

1. **Authentication → Sign In / Providers → "Allow new users to sign up" → ON**, and under **Phone**, **"Confirm phone" → ON**. Phone sign-in needs both; the database itself refuses email sign-ups (except the admin allow-list) and any phone account that didn't come through the sign-in page.
2. **SQL Editor → New query →** paste the whole of `docs/launch/finish-admin-function.sql` → **Run**. Do this **before you send the first consent link**. It does two things: it lets admin *remove* a category from a provider (adding already works), and it makes the consent page greet the trader by name and show the WhatsApp button note. It shows a "destructive operation" warning because the function contains a `delete` — that's expected; confirm.

## Step 3b — Cap the SMS bill (Twilio and Supabase, 15 minutes)

Sign-in codes cost money per text. The app limits how many it asks for, but only Twilio can truly stop the spending. Before anyone signs in:

- [ ] **Twilio → Billing:** pay as you go with **prepaid credit** (top up £20) and **auto-recharge OFF**. When the credit runs out, texts stop. This is the only hard stop.
- [ ] **Twilio → Monitor → Usage triggers:** a **usage alert** emailing you at **£10** and **£20** a month for SMS and for Lookup. (An alert only emails; it doesn't stop anything.)
- [ ] **Twilio → Messaging → Settings → Geo permissions:** **United Kingdom only**.
- [ ] **Twilio → Messaging → Services:** create a Messaging Service (sender: alphanumeric **BoltonVouch**), turn on **SMS Pumping Protection**, copy its **MG…** SID into Railway as `TWILIO_MESSAGING_SERVICE_SID`.
- [ ] **Supabase → Authentication → Rate Limits:** **SMS sent per hour → 30**.
- [ ] **Supabase → Authentication → Hooks → Send SMS hook → HTTPS:** URL `https://boltonvouched.ysbdesigns.uk/api/auth/sms-hook`, generate the secret, paste it into Railway as `SUPABASE_SMS_HOOK_SECRET`, wait for Railway to redeploy, then **enable** the hook. From then on Supabase can't text anyone the sign-in page didn't approve, so every text counts towards the app's £20 monthly cap.
- [ ] Test: sign in on your own phone at `/platform/sign-in`. If the code doesn't arrive, turn the hook off again and check Railway's logs for `sms-hook:`.

## Step 4 — Sign in and add traders

- Go to `/admin` on the site (e.g. https://boltonvouched.ysbdesigns.uk/admin).
- Email: **yameen@ysbdesigns.uk** · Password: sent to you in the chat (not stored in this repo).
- **Add provider** → name, business, trade(s), areas, mobile, WhatsApp → Save. They start as **invited**.
- Gas & boilers needs a Gas Safe check recorded first (number + expiry); driving instructors need a DVSA ADI check.
- **Copy consent link** → send it with message A below.
- When they tap **"I agree, list me"**, their status becomes **consented** → open them in admin → **Set live**. They appear on the site straight away.

## Step 5 — Messages

### A. To each trader, one-to-one (consent first)

> Alright [Name], it's Yameen from the Bolton Tradesmen group.
>
> I've launched Bolton Vouched, a free directory for the group so people can find you and contact you straight away. I'd like to list you.
>
> This link shows exactly how you'll appear (name, trade, areas and Call/WhatsApp buttons; your number isn't shown on the page). If you're happy, tap "I agree":
> [CONSENT LINK]
>
> Fair warning: people who've used you can leave reviews, and I won't remove one just because it's unflattering, only if it's fake or abusive. You can reply to any review by signing in with your number, and you can come off any time.
>
> Your basic listing is free, no catch. Any questions just message me.

### B. To each trader once they're live

> You're live on Bolton Vouched, [Name] 👍
>
> Your page: [PROFILE LINK — e.g. https://boltonvouched.ysbdesigns.uk/platform/p/ace-plumbing]
>
> People can now find you and ring or WhatsApp you straight from it. Your place in the list comes from what reviewers say about the quality of your work; nobody can pay to jump ahead. Reviews are open, so share your link with happy customers and ask them to leave one. Sign in with this number to reply.
>
> If anything on your listing needs changing, just drop me a message.

### C. To the WhatsApp group

> Morning all 👋
>
> Every week someone in here asks "anyone know a good…?" and the answers get lost in the scroll. So there's now **Bolton Vouched**, a home for the people this group recommends, built by YSB Designs:
>
> 👉 https://boltonvouched.ysbdesigns.uk
>
> • Find plumbers, electricians, caterers, bouncy castles, man & van and more
> • Tap Call or WhatsApp straight from their page, no sign-up
> • Every pro on there has agreed to be listed, and nobody can pay to rank higher
> • Leave a review for someone you've used: sign in with your mobile, takes a minute
> • Tip: tap "Add it to your phone" on the page and it works like an app
>
> **Traders in the group:** if you'd like to be added (a basic listing is free), raise a support ticket by emailing **support@ysbdesigns.uk** or on WhatsApp at **07466 487591** with your name, trade and the areas you cover (or tap "WhatsApp us" or "Email a ticket" on the site) and the Bolton Vouched team will get you on.
>
> It's brand new, so let us know what you think. Still ask in here as normal; we'll keep adding the people you recommend.

Send C only once at least a handful of traders are live, so the first visit doesn't look empty.

---

## What's live vs coming

- **Live:** directory, categories, provider profiles, Call/WhatsApp (counted as enquiries), consent links, admin, phone sign-in, reviews with replies and proof checks, review moderation.
- **Coming:** community questions (Plan 3); trader dashboard and the optional Verified tier (Plan 4); complaints process and monitoring (Plan 5).
- Before wider promotion: solicitor review of the draft policy pages (they show "Draft — pending legal review"), and ICO registration for YSB Ventures Ltd.
