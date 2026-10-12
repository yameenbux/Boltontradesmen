-- Wrong-code limiter (final review 2, I4). Supabase's own verification limits are per IP, and every call
-- reaches Supabase from the app's address, so they are one bucket for the whole site. otp_verify_gate is
-- asked before every code check: it refuses after 5 wrong codes for a number in 15 minutes, or 20 from one
-- connection (ip_hash; IPv6 grouped by /64 in the app) in an hour. Attempts not yet recorded count as wrong,
-- so parallel guesses can't slip past; a right code doesn't count; refused attempts don't extend a lockout.
begin;
select plan(19);

create function public.t_attempt(p_phone text, p_ip text, p_ok boolean) returns text language plpgsql as $$
declare v_id bigint; v_verdict text;
begin
  select attempt_id, verdict into v_id, v_verdict from public.otp_verify_gate(p_phone, p_ip);
  if v_verdict = 'ok' and p_ok is not null then
    perform public.otp_verify_record(v_id, p_ok);
  end if;
  return v_verdict;
end $$;
grant execute on function public.t_attempt(text, text, boolean) to service_role;

set local role service_role;
-- per number
select is((select string_agg(public.t_attempt('+447700900451', 'ip-a', false), ',') from generate_series(1, 5)),
  'ok,ok,ok,ok,ok', 'five wrong codes for a number are each checked');
select is(public.t_attempt('+447700900451', 'ip-b', false), 'number_locked', 'the sixth is refused, from any connection');
select is(public.t_attempt('+447700900451', 'ip-c', true), 'number_locked', 'even if it would have been right');
select is(public.t_attempt('+447700900452', 'ip-a', false), 'ok', 'another number is unaffected');
reset role;
select is((select count(*)::int from public.otp_verify_attempts where phone_e164 = '+447700900451' and outcome = 'locked'), 2,
  'refused attempts are recorded as locked');
update public.otp_verify_attempts set created_at = now() - interval '16 minutes' where phone_e164 = '+447700900451';
set local role service_role;
select is(public.t_attempt('+447700900451', 'ip-a', false), 'ok', 'after 15 minutes the number may try again');

-- right codes don't count
select is((select string_agg(public.t_attempt('+447700900453', 'ip-d', true), ',') from generate_series(1, 7)),
  'ok,ok,ok,ok,ok,ok,ok', 'right codes never lock a number');

-- unrecorded attempts (still with Supabase) count, so parallel guesses can't slip past
select is((select string_agg(public.t_attempt('+447700900454', 'ip-e', null), ',') from generate_series(1, 6)),
  'ok,ok,ok,ok,ok,number_locked', 'attempts in flight count towards the limit');

-- per connection: 20 in an hour, across numbers
select is((select count(*)::int from generate_series(1, 20) n
           where public.t_attempt('+4477009005' || lpad(n::text, 2, '0'), 'ip-f', false) = 'ok'), 20,
  'twenty wrong codes from one connection, for different numbers');
select is(public.t_attempt('+447700900599', 'ip-f', false), 'ip_locked', 'the twenty-first from that connection is refused');
select is(public.t_attempt('+447700900599', 'ip-g', false), 'ok', 'the same number from another connection is fine');
reset role;
update public.otp_verify_attempts set created_at = now() - interval '61 minutes' where ip_hash = 'ip-f';
set local role service_role;
select is(public.t_attempt('+447700900598', 'ip-f', false), 'ok', 'after an hour the connection may try again');

-- recording: once, ok or wrong only
select throws_ok($$select public.otp_verify_record(-1, true)$$, 'P0001', 'unknown_attempt', 'an unknown attempt id raises');
reset role;

-- limits come from settings
update public.settings set value = '{"number_15m":1,"ip_1h":20}'::jsonb where key = 'otp_verify_limits';
set local role service_role;
select is(public.t_attempt('+447700900455', 'ip-h', false) || ',' || public.t_attempt('+447700900455', 'ip-h', false),
  'ok,number_locked', 'the per-number limit is read from settings.otp_verify_limits');
reset role;

-- old rows are purged on the next call
insert into public.otp_verify_attempts (phone_e164, ip_hash, outcome, created_at) values ('+447700900456', 'ip-old', 'wrong', now() - interval '2 days');
set local role service_role;
select public.t_attempt('+447700900457', 'ip-i', false) is not null as called;
reset role;
select is((select count(*)::int from public.otp_verify_attempts where ip_hash = 'ip-old'), 0, 'attempts older than a day are purged');

-- closed to browsers
set local role anon;
select throws_ok($$select * from public.otp_verify_gate('+447700900458', 'x')$$, '42501', null, 'anon cannot call otp_verify_gate');
reset role;
set local role authenticated;
select throws_ok($$select * from public.otp_verify_gate('+447700900458', 'x')$$, '42501', null, 'authenticated cannot call otp_verify_gate');
select throws_ok($$select public.otp_verify_record(1, true)$$, '42501', null, 'authenticated cannot call otp_verify_record');
select throws_ok($$select count(*) from public.otp_verify_attempts$$, '42501', null, 'authenticated cannot read otp_verify_attempts');
reset role;

select * from finish();
rollback;
