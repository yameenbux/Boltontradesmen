-- Final review I1: the monthly SMS cap, the number/IP limits and the Lookup only covered texts the app asked
-- for. Supabase also texts existing accounts directly (POST /auth/v1/otp, phone change, reauthentication),
-- which none of those checks saw.
--
-- With Supabase's Send SMS hook pointed at the app (/api/auth/sms-hook, README -> Deploying), Supabase hands
-- every text to the app instead of sending it, and the app asks sms_hook_gate first: a text goes out only for
-- a sign-in request that otp_gate let through and the Lookup approved in the last 5 minutes, once per request.
-- So every text counts towards the cap and passes the same limits. Re-runnable.
--
-- sms_hook_sends is its own table (not a column on otp_requests) on purpose: for a brand-new account the
-- auth.users guard has just updated the otp_requests row inside GoTrue's still-open transaction, and GoTrue
-- waits for this hook before committing. Updating that row here would wait on that lock until the hook timed out.

create table if not exists public.sms_hook_sends (
  request_id bigint primary key,
  phone_e164 text not null,
  created_at timestamptz not null default now()
);
create index if not exists sms_hook_sends_created_idx on public.sms_hook_sends (created_at);
alter table public.sms_hook_sends enable row level security;
revoke all on public.sms_hook_sends from public, anon, authenticated;

create or replace function public.sms_hook_gate(p_phone text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_e164 text;
  v_request bigint;
begin
  if p_phone is null or ltrim(btrim(p_phone), '+') !~ '^447[1-9][0-9]{8}$' then
    return 'refused';
  end if;
  v_e164 := '+' || ltrim(btrim(p_phone), '+');

  delete from public.sms_hook_sends where created_at < now() - interval '30 days';

  -- Plain reads only: never lock the otp_requests row (see above).
  select r.id into v_request
  from public.otp_requests r
  where r.phone_e164 = v_e164
    and r.outcome = 'approved'
    and r.created_at > now() - interval '5 minutes'
    and not exists (select 1 from public.sms_hook_sends s where s.request_id = r.id)
  order by r.id desc
  limit 1;
  if v_request is null then
    return 'refused';
  end if;

  insert into public.sms_hook_sends (request_id, phone_e164) values (v_request, v_e164)
  on conflict (request_id) do nothing;
  if not found then
    return 'refused';  -- a concurrent call used this request first
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.sms_hook_gate(text) from public, anon, authenticated;
grant execute on function public.sms_hook_gate(text) to service_role;
