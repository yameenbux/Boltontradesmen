-- Final review 2, I4: an app-side limit on wrong sign-in codes.
--
-- Supabase's "token verifications per 5 minutes per IP" limit sees only the app's server address, so it is
-- one bucket for the whole site: one visitor submitting ~150 wrong codes would make every resident's right
-- code fail until the window passed. The app now asks otp_verify_gate before every code check:
--   * 5 wrong codes for a number in 15 minutes  -> 'number_locked'
--   * 20 wrong codes from one connection in 1 hour (ip_hash; IPv6 grouped by /64 in the app) -> 'ip_locked'
-- An attempt counts from the moment it is let through until otp_verify_record marks it right ('ok'), so
-- parallel guesses can't slip past. Refused attempts are recorded as 'locked' and don't extend a lockout.
-- Limits live in settings.otp_verify_limits. Rows are kept a day. Supabase's own limits stay as the outer ceiling.
-- Re-runnable.

create table if not exists public.otp_verify_attempts (
  id bigint generated always as identity primary key,
  phone_e164 text not null,
  ip_hash text not null,
  outcome text not null default 'pending' check (outcome in ('pending', 'ok', 'wrong', 'locked')),
  created_at timestamptz not null default now()
);
create index if not exists otp_verify_attempts_phone_idx on public.otp_verify_attempts (phone_e164, created_at);
create index if not exists otp_verify_attempts_ip_idx on public.otp_verify_attempts (ip_hash, created_at);
create index if not exists otp_verify_attempts_created_idx on public.otp_verify_attempts (created_at);
alter table public.otp_verify_attempts enable row level security;
revoke all on public.otp_verify_attempts from public, anon, authenticated;

insert into public.settings (key, value) values ('otp_verify_limits', '{"number_15m":5,"ip_1h":20}'::jsonb)
on conflict (key) do nothing;

create or replace function public.otp_verify_gate(p_phone text, p_ip_hash text)
returns table (attempt_id bigint, verdict text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  v_n int;
  v_i int;
  v_verdict text := 'ok';
  v_id bigint;
begin
  -- Phone lock first, then IP, always in that order (no deadlocks between concurrent checks).
  perform pg_advisory_xact_lock(hashtext('otp_verify:phone:' || coalesce(p_phone, '')));
  perform pg_advisory_xact_lock(hashtext('otp_verify:ip:' || coalesce(p_ip_hash, '')));
  delete from public.otp_verify_attempts where created_at < now() - interval '1 day';

  select value into v_limits from public.settings where key = 'otp_verify_limits';
  v_limits := coalesce(v_limits, '{}'::jsonb);

  select count(*) into v_n from public.otp_verify_attempts
  where phone_e164 = p_phone and outcome in ('pending', 'wrong') and created_at > now() - interval '15 minutes';
  select count(*) into v_i from public.otp_verify_attempts
  where ip_hash = p_ip_hash and outcome in ('pending', 'wrong') and created_at > now() - interval '1 hour';

  if v_n >= coalesce((v_limits ->> 'number_15m')::int, 5) then
    v_verdict := 'number_locked';
  elsif v_i >= coalesce((v_limits ->> 'ip_1h')::int, 20) then
    v_verdict := 'ip_locked';
  end if;

  insert into public.otp_verify_attempts (phone_e164, ip_hash, outcome)
  values (coalesce(p_phone, ''), coalesce(p_ip_hash, ''), case when v_verdict = 'ok' then 'pending' else 'locked' end)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;

create or replace function public.otp_verify_record(p_attempt_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.otp_verify_attempts
  set outcome = case when p_ok then 'ok' else 'wrong' end
  where id = p_attempt_id and outcome = 'pending';
  if not found then
    raise exception 'unknown_attempt';
  end if;
end;
$$;

revoke execute on function public.otp_verify_gate(text, text) from public, anon, authenticated;
revoke execute on function public.otp_verify_record(bigint, boolean) from public, anon, authenticated;
grant execute on function public.otp_verify_gate(text, text) to service_role;
grant execute on function public.otp_verify_record(bigint, boolean) to service_role;
