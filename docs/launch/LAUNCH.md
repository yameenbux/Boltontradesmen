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

The CNAME currently points at the old GitHub Pages address (`….github.io`) — **replace** it. Then in GitHub → repo **Settings → Pages**, remove the custom domain / turn Pages off (the app can't run on Pages).

When Railway shows the domain as active (usually minutes, up to an hour), change one Railway variable:
`NEXT_PUBLIC_SITE_URL` → `https://boltonvouched.ysbdesigns.uk`
(this is the address used in consent links you copy from admin).

## Step 3 — Two clicks in Supabase

1. **Authentication → Sign In / Providers → "Allow new users to sign up" → ON**. Sign-in is Google or an email code (Step 3b sets them up); the database itself refuses password sign-ups and any email account that didn't come through the sign-in page (except the admin allow-list).
2. **SQL Editor → New query →** paste the whole of `docs/launch/finish-admin-function.sql` → **Run**. Do this **before you send the first consent link**. It does two things: it lets admin *remove* a category from a provider (adding already works), and it makes the consent page greet the trader by name and show the WhatsApp button note. It shows a "destructive operation" warning because the function contains a `delete` — that's expected; confirm.

## Step 3a — Paste the database changes (before merging Plan 2 to `main`, 20 minutes)

The reviews and phone sign-in release needs these database changes in production **before** its code reaches `main` (the new code calls functions they add; the live code keeps working on the new schema). In Supabase → **SQL Editor**, paste each whole file from `supabase/migrations/` once, in this order, and **Run** it. The editor runs a file as one transaction, so a file that fails leaves nothing behind and can be re-run once fixed. Skip a file only if you've already run it.

1. `20261012000002_plan1_followups.sql` — open consent links get 14 days from now; removal reasons on reviews.
2. `20261012000003_phone_accounts.sql` — **care:** it adds a name-format check to `profiles`. First run `select user_id, display_name, postcode_district from public.profiles;` and make sure the admin's row has `display_name` and `postcode_district` empty (null) or valid (e.g. "Sarah K." / "BL3"); fix it if not, then paste. It also creates triggers on `auth.users`; afterwards `select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;` should list `bv_guard_auth_user_insert` and `bv_guard_auth_user_phone`.
3. `20261012000004_review_posting.sql`
4. `20261012000005_review_flags.sql`
5. `20261012000006_review_public.sql` (must follow 000004)
6. `20261012000007_review_proofs.sql` — then check **Storage → `review-proofs`** exists, is private, 10 MB, JPEG/PNG/WebP/PDF, no policies.
7. `20261012000008_admin_moderation.sql`
8. `20261012000009_provider_replies.sql`
9. `20261012000010_account_deletion.sql`
10. `20261012000011_phone_signup_nonce.sql` — **care:** it drops and re-creates the two `auth.users` triggers from 000003. In plain Postgres only the table's owner (`supabase_auth_admin`) may drop a trigger; Supabase says its `postgres` user can, but it hasn't been tried there. If the editor says *must be owner of relation users*, edit the pasted text: delete the two `drop trigger if exists … / create trigger …` pairs for `bv_guard_auth_user_insert` and `bv_guard_auth_user_phone` (the triggers from 000003 already call the new `private.guard_auth_user()`), keep the `bv_scrub_auth_user` lines, and run it again. Then re-run the trigger check from step 2: it should now also list `bv_scrub_auth_user`.
11. `20261012000012_sms_hook.sql`
12. `20261012000013_review_writes_server_only.sql` — review writes become server-only (the device check can't be dodged).
13. `20261012000014_removal_survives_resignup.sql` — a removal for cause survives deleting the account and signing up again.
14. `20261012000015_otp_verify_limits.sql` — limits on wrong sign-in codes.
15. `20261012000016_review2_minors.sql` — confirmed-mobile check, report limit, the admin can't delete itself.
16. `20261012000017_owner_decisions.sql` — 5 wrong group codes per person a day (the group code has since been taken out of the site; the database parts stay, unused); number Lookups count towards the £20 monthly cap (`lookup_cost_gbp`, £0.01); proof files can be deleted 12 months after they're checked.
17. **Plan 2b (free sign-in):** paste the whole of `docs/launch/plan-2b-production.sql` **once** and **Run** (it's migrations 000018 onwards in one transaction, ending with a check that fails loudly if anything is missing; it should say `Plan 2b database changes applied` with the number of migrations in it). Do this before Plan 2b is merged to `main`, after Step 3b's settings.
18. **Launch checklist (Get listed form):** after step 17, paste the whole of `docs/launch/launch-checklist-production.sql` **once** and **Run** (migration 000026 onwards in one transaction; it refuses to run, changing nothing, if step 17 hasn't been done). It should say `Launch checklist database changes applied` with the number of migrations in it. Do this before the launch checklist branch is merged to `main`: the /get-listed form needs it.
19. **Review cards (where a review came from):** after step 18, paste the whole of `docs/launch/review-source-production.sql` **once** and **Run** (migration 000027 onwards in one transaction; it refuses to run, changing nothing, if step 18 hasn't been done). It should say `Review card database changes applied` with the number of migrations in it. Do this before the review request links branch is merged to `main`. Reviews still post without it, but the admin won't see which came from a review card until it's run.
20. **Taking on work (availability):** after step 19, paste the whole of `docs/launch/availability-production.sql` **once** and **Run** (migration 000028 onwards in one transaction; it refuses to run, changing nothing, if step 19 hasn't been done). It should say `Availability database changes applied` with the number of migrations in it. Do this before the availability branch is merged to `main`: the trader's and the admin's availability controls need it.
21. **Trader dashboard (enquiry counts, edit, pause and withdraw):** after step 20, paste the whole of `docs/launch/trader-dashboard-production.sql` **once** and **Run** (migration 000029 onwards in one transaction; it refuses to run, changing nothing, if step 20 hasn't been done). It should say `Trader dashboard database changes applied` with the number of migrations in it. Do this before the trader dashboard branch is merged to `main`: the trader's page reads its enquiry counts and listing details from it. Listings already paused count as paused by you, so traders can't unpause them.

Check afterwards: `select proname from pg_proc where proname in ('otp_approve','sms_hook_gate','submit_review','delete_my_account','otp_verify_gate','proof_files_due');` returns six rows, and `select pg_get_function_identity_arguments('public.submit_review'::regproc);` shows `p_uid uuid, p jsonb, p_device_hash text`.

There's no group code to set: the site no longer asks for one, so the `group_code` setting is unused.

## Step 3b — Free sign-in setup (Google and email codes, about 45 minutes)

Texted codes are switched off (no SMS bill). People sign in with **Continue with Google** or a **6-digit code sent to their email**. The full click-by-click steps are in *Owner actions* of `docs/superpowers/plans/2026-10-12-plan-2b-free-sign-in.md`; in short:

- [ ] **Resend** (free: 100 emails a day, 3,000 a month), region EU (Ireland): add the domain `ysbdesigns.uk`, add the DNS records it shows (they sit on the `send` subdomain), wait for **Verified**, create an API key with **Sending access**.
- [ ] **Supabase → Authentication → Emails → SMTP Settings:** custom SMTP on; sender `noreply@ysbdesigns.uk`, name `Bolton Vouched`, host `smtp.resend.com`, port `465`, username `resend`, password the Resend API key, minimum interval 60 seconds. **Rate limits → emails sent per hour: 30.**
- [ ] **Supabase → Authentication → Emails → Templates:** **Confirm signup** and **Magic Link** both get the subject `Your Bolton Vouched sign-in code` and the body from `supabase/templates/sign-in-code.html` (it shows the code and has no link).
- [ ] **Supabase → Sign In / Providers → Email:** enabled, **Confirm email ON** (see Step 3c), **Email OTP length 6**, **Email OTP expiration 900**.
- [ ] **Google Cloud Console:** project **Bolton Vouched**, OAuth consent screen (External, no logo, scopes `openid`, email, profile only, then **Publish app**), and an OAuth client (Web) with redirect URI `https://mmarznvndvbwyhhtbfjy.supabase.co/auth/v1/callback`.
- [ ] **Supabase → Sign In / Providers → Google:** enabled with that client ID and secret; "Skip nonce check" off; "Allow users without an email" off. **URL Configuration:** Site URL `https://boltonvouched.ysbdesigns.uk`, Redirect URLs `https://boltonvouched.ysbdesigns.uk/**`.
- [ ] **Supabase → Sign In / Providers → Phone: OFF**, and **Hooks → Send SMS hook: OFF**.
- [ ] **Railway → web → Variables:** `SIGN_IN_PHONE=off`. The SMS provider variables and `SUPABASE_SMS_HOOK_SECRET` can be removed (keep them only if you plan to switch phone sign-in back on; README → Phone sign-in has the steps).
- [ ] Test on your phone, in the browser and in the home-screen app: sign in with an email code (check the sender, and that it arrives within a minute), leave a test review → "Waiting for a quick check — it'll appear once approved" → approve it in `/admin` → it shows. Then **Continue with Google** with a different account → its review says "Published".

## Step 3c — Free sign-in settings that must stay as set

- [ ] **Supabase → Authentication → Sign In / Providers → Email → "Confirm email" → ON.** Never turn it off. With it off, Supabase confirms new email accounts itself, after the database has checked them, so an email account could be made without the 6-digit code. The app's guard relies on every new email account arriving unconfirmed.
- [ ] **Email OTP length 6**, **Email OTP expiration 900** seconds (15 minutes, matching the app's sign-in window).
- [ ] Resend's free tier allows 100 emails a day; the app stops at 80 a day and 2,900 a month and tells people to try tomorrow or use Google. To change the limits: `select value from public.settings where key = 'email_limits';`. The cap is soft: Supabase's 30-an-hour limit doesn't stop a script asking Supabase directly all day, so keep Step 3d's CAPTCHA on and watch Resend's daily count for the first days.
- [ ] **No other sign-in providers** (only Google and Email; Anonymous sign-ins off), and on Google **"Allow users without an email" off**. The database lets an account with neither an email nor a phone through (only test fixtures make those), and it would count as signed in.

## Step 3d — Cloudflare Turnstile: stop scripts using up the free emails (free, about 15 minutes)

Without this, a script can ask for sign-in codes all day and use up Resend's 100 free emails, so nobody can sign in by email until tomorrow (Google still works).

- [ ] **Cloudflare** (a free account is enough; the domain doesn't have to be on Cloudflare): **Turnstile → Add widget**. Name `Bolton Vouched`, hostname `boltonvouched.ysbdesigns.uk` (add `web-production-0ec9b.up.railway.app` too if you still use that address), widget mode **Managed**. Copy the **Site key** and the **Secret key**.
- [ ] **Railway → web → Variables:** `TURNSTILE_SITE_KEY` = the site key, `TURNSTILE_SECRET_KEY` = the secret key. Set **both** together: with only one set, email sign-in refuses everyone. (Left unset, there's no check.)
- [ ] **Supabase → Authentication → Attack Protection (Bot and Abuse Protection) → Enable CAPTCHA protection → ON**, provider **Turnstile by Cloudflare**, secret = the **same secret key**. This makes Supabase refuse code requests made straight to its API (which skip the app's limits). The app's own requests use the secret Supabase key, which Supabase lets through after the app has checked Turnstile itself; the admin sign-in at `/admin/login` shows the widget and passes its token on.
- [ ] Do the Railway variables first and wait for the redeploy, then switch on Supabase's CAPTCHA (the other way round, the admin sign-in fails until the deploy lands).
- [ ] Test: sign in with an email code on your phone (most people see no puzzle; some get a checkbox), and sign in to `/admin`. If email codes stop arriving after turning on Supabase's CAPTCHA, check that `SUPABASE_SERVICE_ROLE_KEY` on Railway is the **service_role** key (Step 1).
- **Content Security Policy:** the site doesn't send one today. If one is added later, it must allow `https://challenges.cloudflare.com` in `script-src` and `frame-src` (and `connect-src`), or the widget won't load and email sign-in will refuse everyone.

## Step 4 — Sign in and add traders

- Go to `/admin` on the site (e.g. https://boltonvouched.ysbdesigns.uk/admin).
- Email and password: the admin account you were given in the chat (neither is stored in this repo).
- **Add provider** → name, business, trade(s), areas, mobile, WhatsApp → Save. They start as **invited**.
- Gas & boilers needs a Gas Safe check recorded first (number + expiry); driving instructors need a DVSA ADI check.
- **Copy consent link** → send it with message A below.
- When they tap **"I agree, list me"**, their status becomes **consented** → open them in admin → **Set live**. They appear on the site straight away.
- When a trader wants to reply to reviews: open them in admin → **Trader sign-in link** (it's copied for you; it works once and lasts 14 days) → send it to them on WhatsApp. They open it, sign in with Google or their email, and tap **"Yes, this is my business"**. If the wrong person opened it, **Unlink** with a reason and make a new link.

## Step 5 — Messages

### A. To each trader, one-to-one (consent first)

> Alright [Name], it's the Bolton Vouched team, from the Bolton Tradesmen group.
>
> We've launched Bolton Vouched, a free directory for the group so people can find you and contact you straight away. We'd like to list you.
>
> This link shows exactly how you'll appear (name, trade, areas and Call/WhatsApp buttons; your number isn't shown on the page). If you're happy, tap "I agree":
> [CONSENT LINK]
>
> Fair warning: people who've used you can leave reviews, and we won't remove one just because it's unflattering, only if it's fake or abusive. You can reply to any review: we'll send you a private sign-in link for your listing. And you can come off any time.
>
> Your basic listing is free, no catch. Any questions, message us on this number or email support@ysbdesigns.uk.

### B. To each trader once they're live

> You're live on Bolton Vouched, [Name] 👍
>
> Your page: [PROFILE LINK — e.g. https://boltonvouched.ysbdesigns.uk/platform/p/ace-plumbing]
>
> People can now find you and ring or WhatsApp you straight from it. Your place in the list comes from what reviewers say about the quality of your work; nobody can pay to jump ahead. Reviews are open, so share your link with happy customers and ask them to leave one. Ask us for your sign-in link to reply to reviews.
>
> If anything on your listing needs changing, just drop us a message here or email support@ysbdesigns.uk.

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
> • Leave a review for someone you've used: sign in with Google or your email, takes a minute
> • Tip: tap "Add it to your phone" on the page and it works like an app
>
> **Traders in the group:** if you'd like to be added (a basic listing is free), raise a support ticket by emailing **support@ysbdesigns.uk** or on WhatsApp at **07466 487591** with your name, trade and the areas you cover (or fill in the form at https://boltonvouched.ysbdesigns.uk/get-listed) and the Bolton Vouched team will get you on.
>
> It's brand new, so let us know what you think. Still ask in here as normal; we'll keep adding the people you recommend.

Send C only once at least a handful of traders are live, so the first visit doesn't look empty.

---

## What's live vs coming

- **Live:** directory, categories, provider profiles, Call/WhatsApp (counted as enquiries), consent links, admin, Google and email sign-in, trader sign-in links, reviews with replies and proof checks, review moderation.
- **Coming:** community questions (Plan 3); trader dashboard and the optional Verified tier (Plan 4); complaints process and monitoring (Plan 5).
- Before wider promotion: solicitor review of the draft policy pages (they show "Draft — pending legal review"), and ICO registration for YSB Ventures Ltd.

## Every month — delete old proof files (until Plan 5)

The privacy notice says proof files are deleted 12 months after they're checked. Until Plan 5 adds scheduled jobs, do it by hand once a month: **admin → Proofs → Old proof files → Delete proof files due now**. It deletes the files from Storage and keeps each review's Verified job label. (Plan 5: run this on a schedule, along with the other retention purges.)

## Sign-in records (automatic, with a button)

The privacy notice says sign-in records (which hold the email address or number that was entered) are kept for up to 30 days, and an account where a code was asked for but never used is deleted after 24 hours. Every "Email me a code" request does this tidy at most once an hour. If nobody has signed in for a while, press **admin → Sign-in records → Tidy sign-in records** (on the admin home page) now and then.
