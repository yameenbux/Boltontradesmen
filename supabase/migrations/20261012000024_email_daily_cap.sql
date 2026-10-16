-- Plan 2b final review I2: the app's daily email cap drops from 90 to 80, leaving room under Resend's free 100 a
-- day for the codes Supabase sends without the app (direct API calls, now behind Supabase's CAPTCHA) and for the
-- admin. Only lowers a cap still at the old default or above; a cap the owner set lower stays. Re-runnable.
update public.settings
set value = jsonb_set(value, '{daily_cap}', '80'::jsonb)
where key = 'email_limits' and coalesce((value ->> 'daily_cap')::int, 90) > 80;
