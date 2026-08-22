# Setup

About 20 minutes. Do it on a laptop — it involves copying keys and pasting SQL, which is miserable on a phone.

At the end you'll have a public URL anyone can open with no account, where people can leave reviews, plus an admin page only you can get into.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up. The free tier is plenty — the paid tiers are irrelevant at this scale.
2. **New project**. Name it `bolton-trades`.
3. Set a database password and save it somewhere. You won't need it often, but you can't recover it.
4. **Region: London (eu-west-2).** This matters — it keeps the data in the UK, which is one less thing to explain in your privacy notice.
5. Wait a couple of minutes while it builds.

## 2. Create the tables

1. In the left sidebar: **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in.
3. **Before running it**, find this line near the top and change the email to the one you'll sign in with:

   ```sql
   insert into public.admins (email) values ('CHANGE-ME@example.com');
   ```

4. Click **Run**. You should see "Success. No rows returned."

The script is safe to run again — it drops and recreates everything. Which also means **running it again wipes the register**, so don't once you have real data.

## 3. Create your admin login

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Use the same email you put in the `admins` table. Set a strong password.
3. Tick **Auto Confirm User** — otherwise it waits for an email confirmation that never arrives.

## 4. Turn off public signups

**Do not skip this.** By default anyone can create an account on your project.

1. **Authentication** → **Sign In / Providers** (called **Providers** on some versions).
2. Find **Allow new users to sign up** and turn it **off**.

The schema already protects you here — write access needs your email to be in the `admins` table, not just an account. But belt and braces: two independent things now have to fail before someone can edit the register.

## 5. Get your two config values

**Project Settings** → **API**. You need:

- **Project URL** — looks like `https://abcdefghijk.supabase.co`
- **anon public** key — a long string starting `eyJ...`

Then edit `index.html` in this repo, find the `CONFIG` block near the top of the `<script>`, and replace both placeholders:

```js
var CONFIG = {
  url: "https://abcdefghijk.supabase.co",
  anonKey: "eyJhbGciOi..."
};
```

Commit the change.

> **The anon key is meant to be public.** It goes in a public repo and ships to every visitor's browser — that's how Supabase is designed. What protects your data is the row-level security in `schema.sql`, not the secrecy of that key. The key you must *never* commit is the **service_role** key, which bypasses RLS entirely. You won't need it.

## 6. Turn on GitHub Pages

1. In the repo: **Settings** → **Pages**.
2. **Source**: Deploy from a branch. **Branch**: `main`, folder `/ (root)`. Save.
3. Wait a minute or two. Your site appears at:

   **`https://yameenbux.github.io/Boltontradesmen/`**

That's the link for the group. No account, no login, works on any phone.

## 7. Set your group code

Reviews need a code, so only people in the WhatsApp group can post. It starts as `BOLTON`.

To change it: **Table Editor** → `settings` → edit the `join_code` row.

Post the code in the group when you launch. Change it if it leaks.

## 8. Check it works

1. Open the Pages URL. You should see "No traders listed yet".
2. Add `#admin` to the URL, sign in, add a trader.
3. Go back to the plain URL — the trader should be there.
4. Open the plain URL **in a private/incognito window** — this is the real test, because it's what your group will see. Leave a review using the code. It should post.
5. Back in admin: the review shows in the Reviews tab, and the enquiry counter moves when you tap Call.

If step 4 fails, you're testing the thing that actually matters, so don't move on until it works.

---

## Where things live

| What | Where |
|---|---|
| Public register | `https://yameenbux.github.io/Boltontradesmen/` |
| Admin | same URL + `#admin` |
| Data | Supabase → Table Editor |
| Backups | Supabase → Table Editor → ⋮ → Export as CSV |

## Costs

Free. Supabase's free tier covers far more than this will use; GitHub Pages is free for public repos. The only money is a domain if you want one (~£12/year) and the ICO fee (£52/year) once you're holding real people's data.

## When something breaks

**"Couldn't load the register"** — the URL or anon key in `CONFIG` is wrong, or the Supabase project is paused. Free projects pause after a week of no activity; open the Supabase dashboard to wake it.

**"That account isn't an admin"** — the email in the `admins` table doesn't match the email you signed in with. Check for typos and stray spaces.

**"That group code isn't right"** — check the `settings` table. The check is case-insensitive but not space-insensitive.

**Reviews post but don't appear** — you're probably signed in as admin in that tab, which shows removed reviews too. Check in a private window.

**Changes to `index.html` don't show up** — GitHub Pages caches. Hard-refresh, or wait a minute for the deploy to finish; the repo's Actions tab shows when it's done.
