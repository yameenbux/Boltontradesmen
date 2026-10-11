-- Core schema: categories, providers, checks, profiles, settings, audit log.

create type public.provider_status as enum ('invited', 'consented', 'live', 'paused', 'removed');
create type public.category_requirement as enum ('none', 'gas_safe', 'dvsa_adi');
create type public.check_kind as enum ('id', 'insurance', 'gas_safe', 'dvsa_adi', 'food_hygiene', 'pipa', 'niceic_napit', 'dbs', 'other');
create type public.user_role as enum ('resident', 'provider', 'admin');

create table public.category_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort integer not null default 0,
  asks_tidy boolean not null default false
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.category_groups (id) on delete restrict,
  slug text not null unique,
  name text not null,
  requirement public.category_requirement not null default 'none',
  guidance_note text,
  active boolean not null default true
);
create index categories_group_id_idx on public.categories (group_id);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  business_name text not null,
  contact_name text,
  phone_e164 text not null,
  whatsapp_e164 text,
  areas text[] not null default '{}',
  bio text,
  user_id uuid references auth.users (id) on delete set null,
  status public.provider_status not null default 'invited',
  consent_at timestamptz,
  consent_evidence jsonb,
  consent_token uuid unique default gen_random_uuid(),
  consent_token_used_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_live_requires_consent
    check (status <> 'live' or (consent_at is not null and consent_evidence is not null))
);
create index providers_user_id_idx on public.providers (user_id);
create index providers_status_idx on public.providers (status);

create table public.provider_categories (
  provider_id uuid not null references public.providers (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  primary key (provider_id, category_id)
);
create index provider_categories_category_id_idx on public.provider_categories (category_id);

create table public.provider_checks (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  kind public.check_kind not null,
  reference text,
  expires_on date,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users (id) on delete set null,
  document_path text
);
create index provider_checks_provider_id_idx on public.provider_checks (provider_id, kind);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'resident',
  display_name text,
  postcode_district text,
  created_at timestamptz not null default now(),
  blocked_at timestamptz
);

create table public.settings (
  key text primary key,
  value jsonb not null
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- updated_at maintenance
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

-- A provider may list in at most 3 categories.
create function public.enforce_max_categories() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.provider_categories
    where provider_id = new.provider_id
      and not (tg_op = 'UPDATE' and provider_id = old.provider_id and category_id = old.category_id)
  ) >= 3 then
    raise exception 'max 3 categories' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_max_categories
  before insert or update of provider_id, category_id on public.provider_categories
  for each row execute function public.enforce_max_categories();

-- Legally required checks (Gas Safe, DVSA ADI) must be in date before listing.
create function public.enforce_category_requirement() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.category_requirement;
begin
  select requirement into req from public.categories where id = new.category_id;
  if req in ('gas_safe', 'dvsa_adi') then
    if not exists (
      select 1 from public.provider_checks
      where provider_id = new.provider_id
        and kind = req::text::public.check_kind
        and (expires_on is null or expires_on >= current_date)
    ) then
      raise exception 'category requires % check', req using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_category_requirement
  before insert or update of provider_id, category_id on public.provider_categories
  for each row execute function public.enforce_category_requirement();

create function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.user_id = auth.uid()),
    false
  );
$$;

-- RLS on, no policies yet: deny all to anon/authenticated (service role bypasses).
alter table public.category_groups enable row level security;
alter table public.categories enable row level security;
alter table public.providers enable row level security;
alter table public.provider_categories enable row level security;
alter table public.provider_checks enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;
