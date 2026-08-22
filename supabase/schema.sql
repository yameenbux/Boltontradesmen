-- ============================================================
--  Bolton Trades — database schema
--  Paste this whole file into the Supabase SQL Editor and run it.
--  Safe to re-run: it drops and recreates everything.
-- ============================================================

drop function if exists public.submit_review(text, uuid, text, text, int, text, text, boolean, text, text);
drop function if exists public.log_enquiry(uuid, text);
drop function if exists public.is_admin();
drop table if exists public.enquiries cascade;
drop table if exists public.reviews cascade;
drop table if exists public.traders cascade;
drop table if exists public.settings cascade;
drop table if exists public.admins cascade;

-- ------------------------------------------------------------
--  Tables
-- ------------------------------------------------------------

create table public.traders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 60),
  cat         text not null,
  area        text default '',
  phone       text default '',
  whatsapp    text default '',
  verified    boolean not null default false,
  paying      boolean not null default false,
  -- only 'live' traders are visible to the public (spec section 1, rule 3)
  status      text not null default 'live' check (status in ('live','paused')),
  consent_at  date not null default current_date,
  created_at  timestamptz not null default now()
);

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  trader_id      uuid not null references public.traders(id) on delete cascade,
  who            text not null check (length(trim(who)) between 2 and 40),
  job            text not null check (length(trim(job)) between 2 and 70),
  quality        int  not null check (quality between 1 and 5),
  on_time        text not null check (on_time in ('yes','late','noshow')),
  quote          text not null check (quote   in ('yes','slight','over')),
  tidy           boolean not null,
  again          text not null check (again   in ('yes','maybe','no')),
  comment        text default '' check (length(comment) <= 400),
  reply          text default '' check (length(reply)   <= 400),
  -- soft delete only, with a mandatory reason (spec section 6)
  removed        boolean not null default false,
  removed_reason text default '',
  removed_at     date,
  job_date       date not null default current_date,
  created_at     timestamptz not null default now()
);

create table public.enquiries (
  id         uuid primary key default gen_random_uuid(),
  trader_id  uuid not null references public.traders(id) on delete cascade,
  kind       text not null default 'call' check (kind in ('call','whatsapp')),
  created_at timestamptz not null default now()
);

create table public.settings (
  id        int primary key default 1 check (id = 1),
  join_code text not null default 'BOLTON'
);
insert into public.settings (id, join_code) values (1, 'BOLTON');

-- ------------------------------------------------------------
--  Who counts as an admin
--
--  >>> CHANGE THE EMAIL BELOW to the address you will sign in with. <<<
--
--  Being signed in is NOT enough to get write access — your email has to be
--  in this table. That way, if someone ever manages to create an account on
--  the project, they still cannot touch the register.
-- ------------------------------------------------------------

create table public.admins (
  email text primary key
);

insert into public.admins (email) values ('CHANGE-ME@example.com');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create index reviews_trader_idx   on public.reviews (trader_id) where removed = false;
create index enquiries_trader_idx on public.enquiries (trader_id);
create index enquiries_when_idx   on public.enquiries (created_at);

-- ------------------------------------------------------------
--  Row-level security
--  anon  = anyone with the public link
--  authenticated = you, signed in as the admin user
-- ------------------------------------------------------------

alter table public.traders   enable row level security;
alter table public.reviews   enable row level security;
alter table public.enquiries enable row level security;
alter table public.settings  enable row level security;
alter table public.admins    enable row level security;

-- The public may READ live traders and reviews that have not been removed.
create policy traders_public_read on public.traders
  for select to anon using (status = 'live');

create policy reviews_public_read on public.reviews
  for select to anon using (removed = false);

-- The public may NOT insert, update or delete anything directly.
-- Reviews and enquiries go through the functions below, which validate first.
-- (Absence of a policy is a denial — nothing further needed here.)

-- The admin may do anything — but ONLY an address listed in public.admins.
-- Merely holding an account on the project grants nothing.
create policy traders_admin   on public.traders   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy reviews_admin   on public.reviews   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy enquiries_admin on public.enquiries for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_admin  on public.settings  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admins_admin    on public.admins    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- An admin also needs to read the register the same way the public does.
create policy traders_admin_read on public.traders for select to authenticated using (public.is_admin());
create policy reviews_admin_read on public.reviews for select to authenticated using (public.is_admin());

-- Nobody reads the join code over the API — it is only checked inside the
-- function below, which runs with elevated rights.

-- Let a signed-in user ask whether they are an admin, so the app can say
-- "this account isn't an admin" instead of showing a baffling empty screen.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
--  submit_review — the only way an anonymous visitor writes a review
-- ------------------------------------------------------------

create or replace function public.submit_review(
  p_code    text,
  p_trader  uuid,
  p_who     text,
  p_job     text,
  p_quality int,
  p_on_time text,
  p_quote   text,
  p_tidy    boolean,
  p_again   text,
  p_comment text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_id   uuid;
  v_recent int;
begin
  select join_code into v_code from settings where id = 1;

  if v_code is null or upper(btrim(coalesce(p_code, ''))) <> upper(v_code) then
    raise exception 'bad_code' using hint = 'The group code is wrong.';
  end if;

  if not exists (select 1 from traders where id = p_trader and status = 'live') then
    raise exception 'no_trader' using hint = 'That trader is not listed.';
  end if;

  -- crude flood guard: no more than 5 reviews for one trader in an hour
  select count(*) into v_recent
    from reviews
   where trader_id = p_trader and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'too_many' using hint = 'Too many reviews for this trader just now.';
  end if;

  insert into reviews (trader_id, who, job, quality, on_time, quote, tidy, again, comment)
  values (
    p_trader,
    left(btrim(p_who), 40),
    left(btrim(p_job), 70),
    p_quality,
    p_on_time,
    p_quote,
    p_tidy,
    p_again,
    left(btrim(coalesce(p_comment, '')), 400)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_review(text, uuid, text, text, int, text, text, boolean, text, text) from public;
grant execute on function public.submit_review(text, uuid, text, text, int, text, text, boolean, text, text) to anon, authenticated;

-- ------------------------------------------------------------
--  log_enquiry — counts a Call or WhatsApp tap. This is the number
--  the whole pricing model rests on (spec section 8).
-- ------------------------------------------------------------

create or replace function public.log_enquiry(p_trader uuid, p_kind text default 'call')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from traders where id = p_trader and status = 'live') then
    return;
  end if;
  if p_kind not in ('call', 'whatsapp') then
    p_kind := 'call';
  end if;
  insert into enquiries (trader_id, kind) values (p_trader, p_kind);
end;
$$;

revoke all on function public.log_enquiry(uuid, text) from public;
grant execute on function public.log_enquiry(uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
--  Done. Next: Authentication > Users > Add user, to create your
--  admin login. Then put the project URL and anon key into index.html.
-- ------------------------------------------------------------
