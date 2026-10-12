-- Send SMS hook gate (final review I1): with Supabase's Send SMS hook pointed at /api/auth/sms-hook, every
-- text Supabase wants to send is checked here first. A text goes out only for a sign-in request the app's
-- gate approved (rate limits, monthly cap, Lookup) in the last 5 minutes, and only once per request.
begin;
select plan(14);

create function pg_temp.approved(p_phone text, p_nonce text) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  select request_id into v_id from public.otp_gate(p_phone, 'pgtap-hook');
  perform public.otp_approve(v_id, 'mobile', encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex'));
  return v_id;
end $$;

set local role service_role;
select is(public.sms_hook_gate('447700900431'), 'refused', 'no app request for the number: refused (direct /otp to an existing account)');
reset role;

select pg_temp.approved('+447700900431', 'hook-431');
set local role service_role;
select is(public.sms_hook_gate('447700900431'), 'ok', 'an approved app request: one text (GoTrue''s phone format, no +)');
select is(public.sms_hook_gate('+447700900431'), 'refused', 'the same request cannot send a second text');
reset role;
select is((select count(*)::int from public.sms_hook_sends where phone_e164 = '+447700900431'), 1, 'the send is recorded once');

-- two approvals, two texts
select pg_temp.approved('+447700900432', 'hook-432a');
select pg_temp.approved('+447700900432', 'hook-432b');
set local role service_role;
select is(public.sms_hook_gate('447700900432'), 'ok', 'first of two approvals');
select is(public.sms_hook_gate('447700900432'), 'ok', 'second of two approvals');
select is(public.sms_hook_gate('447700900432'), 'refused', 'no third text');
reset role;

-- only approved rows: pending, refused outcomes and old approvals send nothing
select request_id from public.otp_gate('+447700900433', 'pgtap-hook');
set local role service_role;
select is(public.sms_hook_gate('447700900433'), 'refused', 'a pending request (Lookup not done) sends nothing');
reset role;
select public.otp_record(max(id), 'voip', 'nonFixedVoip') from public.otp_requests where phone_e164 = '+447700900433';
set local role service_role;
select is(public.sms_hook_gate('447700900433'), 'refused', 'a refused request (VoIP) sends nothing');
reset role;
select pg_temp.approved('+447700900434', 'hook-434');
update public.otp_requests set created_at = now() - interval '6 minutes' where phone_e164 = '+447700900434';
set local role service_role;
select is(public.sms_hook_gate('447700900434'), 'refused', 'an approval older than 5 minutes sends nothing');
select is(public.sms_hook_gate('not a phone'), 'refused', 'garbage is refused');
select is(public.sms_hook_gate(null), 'refused', 'null is refused');
reset role;

set local role anon;
select throws_ok($$select public.sms_hook_gate('447700900431')$$, '42501', null, 'anon cannot call sms_hook_gate');
reset role;
set local role authenticated;
select throws_ok($$select count(*) from public.sms_hook_sends$$, '42501', null, 'authenticated cannot read sms_hook_sends');
reset role;

select * from finish();
rollback;
