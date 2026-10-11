-- Contact events: logged taps on Call/WhatsApp. Counting is deduplicated so it is hard to game.

do $$ begin
  create type public.contact_type as enum ('profile_view', 'call_tap', 'whatsapp_tap');
exception when duplicate_object then null;
end $$;

create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  type public.contact_type not null,
  actor_id uuid references auth.users (id) on delete set null,
  device_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_events_provider_idx on public.contact_events (provider_id, type, created_at);

-- RLS on, no policies, no grants: only service_role (via the functions below) can touch it.
alter table public.contact_events enable row level security;
revoke all on public.contact_events from public, anon, authenticated;

-- Logs a tap and returns the numbers to redirect to. Unknown or non-live slug: zero rows, nothing inserted.
create or replace function public.log_contact(
  p_slug text, p_type public.contact_type, p_actor uuid, p_device_hash text
) returns table (phone_e164 text, whatsapp_e164 text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text;
  v_wa text;
begin
  select p.id, p.phone_e164, p.whatsapp_e164 into v_id, v_phone, v_wa
  from public.providers p
  where p.slug = p_slug and p.status = 'live';

  if v_id is null then
    return;
  end if;

  insert into public.contact_events (provider_id, type, actor_id, device_hash)
  values (v_id, p_type, p_actor, p_device_hash);

  return query select v_phone, v_wa;
end;
$$;

-- Distinct enquirers: one per (actor or device) per London day; owner, admin and profile views excluded.
create or replace function public.enquiry_count(p_provider uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from (
    select distinct coalesce(e.actor_id::text, e.device_hash),
           (e.created_at at time zone 'Europe/London')::date
    from public.contact_events e
    join public.providers p on p.id = e.provider_id
    where e.provider_id = p_provider
      and e.type in ('call_tap', 'whatsapp_tap')
      and (e.actor_id is null or (e.actor_id is distinct from p.user_id
           and not exists (select 1 from public.profiles a where a.user_id = e.actor_id and a.role = 'admin')))
  ) t;
$$;

revoke execute on function public.log_contact(text, public.contact_type, uuid, text) from public, anon, authenticated;
revoke execute on function public.enquiry_count(uuid) from public, anon, authenticated;
grant execute on function public.log_contact(text, public.contact_type, uuid, text) to service_role;
grant execute on function public.enquiry_count(uuid) to service_role;
