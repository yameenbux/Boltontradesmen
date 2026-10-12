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
16. `20261012000017_owner_decisions.sql` — 5 wrong group codes per person a day; Twilio Lookups count towards the £20 monthly cap (`lookup_cost_gbp`, £0.01); proof files can be deleted 12 months after they're checked.

Check afterwards: `select proname from pg_proc where proname in ('otp_approve','sms_hook_gate','submit_review','delete_my_account','otp_verify_gate','proof_files_due');` returns six rows, and `select pg_get_function_identity_arguments('public.submit_review'::regproc);` shows `p_uid uuid, p jsonb, p_device_hash text`.

Then set a private group code (the one members type on Welcome to get the Group member badge; the default is easy to guess): `update public.settings set value = '"<your code>"'::jsonb where key = 'group_code';`

## Step 3b — Cap the SMS bill (Twilio and Supabase, 15 minutes)

Sign-in codes cost money per text. The app limits how many it asks for, but only Twilio can truly stop the spending. Before anyone signs in:

- [ ] **Twilio → Billing:** pay as you go with **prepaid credit** (top up £20) and **auto-recharge OFF**. When the credit runs out, texts stop. This is the only hard stop.
- [ ] **Twilio → Monitor → Usage triggers:** a **usage alert** emailing you at **£10** and **£20** a month for SMS and for Lookup. (An alert only emails; it doesn't stop anything.)
- [ ] **Twilio → Messaging → Settings → Geo permissions:** **United Kingdom only**.
- [ ] **Twilio → Messaging → Services:** create a Messaging Service (sender: alphanumeric **BoltonVouch**), turn on **SMS Pumping Protection**, copy its **MG…** SID into Railway as `TWILIO_MESSAGING_SERVICE_SID`.
- [ ] **Supabase → Authentication → Rate Limits:** **SMS sent per hour → 30** (your decision; keep it at 30, launch day included). This is site-wide, so on the day you post in the group (717 members) more than 30 people may try to sign in within an hour and some will see "couldn't send a text"; they can try again later in the hour.
- [ ] The app's £20 monthly cap counts **Lookups as well as texts**: each sign-in request that gets past the limits costs a Lookup (`lookup_cost_gbp`, £0.01 by default) whether or not a text goes. If Twilio's Lookup price changes, update it: `update public.settings set value = '0.01'::jsonb where key = 'lookup_cost_gbp';`
- [ ] **Supabase → Authentication → Hooks → Send SMS hook → HTTPS:** URL `https://boltonvouched.ysbdesigns.uk/api/auth/sms-hook`, generate the secret, paste it into Railway as `SUPABASE_SMS_HOOK_SECRET`, wait for Railway to redeploy, then **enable** the hook. From then on Supabase can't text anyone the sign-in page didn't approve, so every text counts towards the app's £20 monthly cap.
- [ ] Test: sign in on your own phone at `/platform/sign-in`. If the code doesn't arrive, turn the hook off again and check Railway's logs for `sms-hook:`.

## Step 3c — Free sign-in (Plan 2b: Google + email code) — settings that must stay as set

The full setup (Resend, Google Cloud, Supabase providers and templates) is in *Owner actions* of
`docs/superpowers/plans/2026-10-12-plan-2b-free-sign-in.md`; Task 11 folds it into Step 3b here. Whatever else you change:

- [ ] **Supabase → Authentication → Sign In / Providers → Email → "Confirm email" → ON.** Never turn it off. With it off, Supabase confirms new email accounts itself, after the database has checked them, so an email account could be made without the 6-digit code. The app's guard relies on every new email account arriving unconfirmed.
- [ ] **Email OTP length 6**, **Email OTP expiration 900** seconds (15 minutes, matching the app's sign-in window).

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

## Every month — delete old proof files (until Plan 5)

The privacy notice says proof files are deleted 12 months after they're checked. Until Plan 5 adds scheduled jobs, do it by hand once a month: **admin → Proofs → Old proof files → Delete proof files due now**. It deletes the files from Storage and keeps each review's Verified job label. (Plan 5: run this on a schedule, along with the other retention purges.)
