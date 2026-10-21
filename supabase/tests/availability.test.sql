-- "Taking on work" (migration 000028): a trader sets their listing's availability, the admin can set or clear it,
-- and provider_public works out what still stands when it's read ('taking' for 14 days, or to the end of "this
-- week"; 'booked' until its date). Only the linked account of a live or paused listing can set its own; every write
-- is audited; availability touches nothing that ranks or badges.
begin;
select plan(57);

update public.settings set value = '["av-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.av_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.av_as(uuid) to authenticated;
create function public.av_today() returns date language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;
grant execute on function public.av_today() to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000082a0', 'av-admin@example.com');
-- How the traders signed in doesn't matter here: bare accounts.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000008201'), ('00000000-0000-0000-0000-000000008202'), ('00000000-0000-0000-0000-000000008203'),
  ('00000000-0000-0000-0000-000000008204'), ('00000000-0000-0000-0000-000000008205');
insert into public.profiles (user_id, role, display_name, blocked_at) values
  ('00000000-0000-0000-0000-0000000082a0', 'admin', null, null),
  ('00000000-0000-0000-0000-000000008201', 'provider', 'Tess T.', null),
  ('00000000-0000-0000-0000-000000008202', 'provider', 'Paul P.', null),
  ('00000000-0000-0000-0000-000000008203', 'provider', 'Rhys R.', null),
  ('00000000-0000-0000-0000-000000008204', 'provider', 'Bea B.', now()),
  ('00000000-0000-0000-0000-000000008205', 'resident', 'Nia N.', null);
-- Tess has two live listings; Paul a paused one; Rhys a removed one; Bea (blocked) a live one; av-free is unlinked.
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000082b1', 'av-tess', 'AV Tess', '+447700900941', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000008201'),
  ('00000000-0000-0000-0000-0000000082b2', 'av-tess-two', 'AV Tess Two', '+447700900942', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000008201'),
  ('00000000-0000-0000-0000-0000000082b3', 'av-paul', 'AV Paul', '+447700900943', 'paused', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000008202'),
  ('00000000-0000-0000-0000-0000000082b4', 'av-rhys', 'AV Rhys', '+447700900944', 'removed', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000008203'),
  ('00000000-0000-0000-0000-0000000082b5', 'av-bea', 'AV Bea', '+447700900945', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000008204'),
  ('00000000-0000-0000-0000-0000000082b6', 'av-free', 'AV Free', '+447700900946', 'live', now(), '{}'::jsonb, null);

-- ---------------------------------------------------------------- the columns
select has_column('public', 'providers', 'availability', 'providers has availability');
select col_type_is('public', 'providers', 'available_until', 'date', 'available_until is a date');
select col_type_is('public', 'providers', 'availability_set_at', 'timestamp with time zone', 'availability_set_at is a timestamptz');
select throws_ok($$update public.providers set availability = 'booked', availability_set_at = now() where slug = 'av-free'$$,
  '23514', null, 'booked needs a date');
select throws_ok($$update public.providers set availability = 'maybe', availability_set_at = now() where slug = 'av-free'$$,
  '23514', null, 'only taking or booked');
select throws_ok($$update public.providers set availability = 'taking' where slug = 'av-free'$$,
  '23514', null, 'a status needs the time it was set');
select is((select availability_status from public.provider_public where slug = 'av-free'), null, 'not set by default: nothing shows');

-- ---------------------------------------------------------------- grants
select ok(not has_function_privilege('anon', 'public.set_my_availability(text, date)', 'execute')
          and has_function_privilege('authenticated', 'public.set_my_availability(text, date)', 'execute'),
  'set_my_availability: signed-in accounts only');
select ok(not has_function_privilege('anon', 'public.admin_set_availability(uuid, text, date)', 'execute')
          and has_function_privilege('authenticated', 'public.admin_set_availability(uuid, text, date)', 'execute'),
  'admin_set_availability: signed-in accounts only (it checks is_admin itself)');
select ok(not has_function_privilege('authenticated', 'private.write_availability(uuid, text, date, text)', 'execute')
          and not has_function_privilege('anon', 'private.write_availability(uuid, text, date, text)', 'execute'),
  'the shared writer is not callable directly');
select ok(has_table_privilege('anon', 'public.provider_public', 'select')
          and has_table_privilege('authenticated', 'public.provider_public', 'select'),
  'provider_public keeps its grants');
select ok(not has_column_privilege('anon', 'public.providers', 'availability', 'update')
          and not has_column_privilege('authenticated', 'public.providers', 'availability', 'update'),
  'nobody writes the column except through the functions');

-- ---------------------------------------------------------------- the trader
set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008201');
select is(public.set_my_availability('taking', null), array['av-tess', 'av-tess-two'],
  'the trader sets Taking on work; it returns their listings'' slugs');
reset role;
select is((select array_agg(availability_status order by slug) from public.provider_public where slug like 'av-tess%'),
  array['taking', 'taking'], 'both of their listings are taking on work');
select ok((select availability_set_at > now() - interval '1 minute' and availability_until is null
           from public.provider_public where slug = 'av-tess'), 'with the time it was set and no date');
select is((select availability_status from public.provider_public where slug = 'av-free'), null, 'nobody else''s listing changes');
select is((select count(*)::int from public.audit_log where action = 'set_availability' and reason = 'taking'
           and actor_id = '00000000-0000-0000-0000-000000008201'
           and target_id in ('00000000-0000-0000-0000-0000000082b1', '00000000-0000-0000-0000-0000000082b2')), 2,
  'an audit row per listing, by the trader');

set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008201');
select lives_ok($$select public.set_my_availability('booked', public.av_today() + 30)$$, 'Booked up until a date a month away');
reset role;
select is((select availability_status || ' ' || availability_until from public.provider_public where slug = 'av-tess'),
  'booked ' || (public.av_today() + 30), 'shows booked with its date');
select is((select reason from public.audit_log where action = 'set_availability' and target_id = '00000000-0000-0000-0000-0000000082b1'
           order by id desc limit 1), 'booked until ' || to_char(public.av_today() + 30, 'YYYY-MM-DD'), 'audited with the date');

set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008201');
select lives_ok($$select public.set_my_availability('taking', public.av_today() + 2)$$, 'Taking on work this week');
reset role;
select is((select availability_status || ' ' || availability_until from public.provider_public where slug = 'av-tess'),
  'taking ' || (public.av_today() + 2), 'shows taking, with the week''s last day');

set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008201');
select lives_ok($$select public.set_my_availability(null, null)$$, 'clearing it');
reset role;
select ok((select availability_status is null and availability_until is null and availability_set_at is null
           from public.provider_public where slug = 'av-tess'), 'cleared: nothing shows');
select ok((select availability is null and available_until is null and availability_set_at is null
           from public.providers where slug = 'av-tess'), 'and nothing is stored');
select is((select reason from public.audit_log where action = 'set_availability' and target_id = '00000000-0000-0000-0000-0000000082b1'
           order by id desc limit 1), 'cleared', 'audited as cleared');

-- ---------------------------------------------------------------- validation
set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008201');
select throws_ok($$select public.set_my_availability('booked', null)$$, 'P0001', 'until_required', 'booked needs a date');
select throws_ok($$select public.set_my_availability('booked', public.av_today())$$, 'P0001', 'until_not_future',
  'the date must be in the future (today is refused)');
select throws_ok($$select public.set_my_availability('booked', public.av_today() - 3)$$, 'P0001', 'until_not_future',
  'a past date is refused');
select throws_ok($$select public.set_my_availability('booked', (public.av_today() + interval '6 months')::date + 1)$$,
  'P0001', 'until_too_far', 'more than 6 months ahead is refused');
select lives_ok($$select public.set_my_availability('booked', (public.av_today() + interval '6 months')::date)$$,
  'exactly 6 months ahead is fine');
select throws_ok($$select public.set_my_availability('taking', public.av_today() + 7)$$, 'P0001', 'not_this_week',
  '"this week" is at most six days on');
select throws_ok($$select public.set_my_availability('taking', public.av_today() - 1)$$, 'P0001', 'not_this_week',
  'and not in the past');
select throws_ok($$select public.set_my_availability('free', null)$$, 'P0001', 'bad_status', 'an unknown status is refused');
reset role;
select is((select available_until from public.providers where slug = 'av-tess'), (public.av_today() + interval '6 months')::date,
  'a refused call changes nothing');

-- ---------------------------------------------------------------- who may set it
set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008202');
select lives_ok($$select public.set_my_availability('taking', null)$$, 'a paused listing''s trader can set it');
select public.av_as('00000000-0000-0000-0000-000000008203');
select throws_ok($$select public.set_my_availability('taking', null)$$, 'P0001', 'not_your_listing',
  'a removed listing''s trader cannot');
select public.av_as('00000000-0000-0000-0000-000000008205');
select throws_ok($$select public.set_my_availability('taking', null)$$, 'P0001', 'not_your_listing',
  'an account with no listing cannot');
select public.av_as('00000000-0000-0000-0000-000000008204');
select throws_ok($$select public.set_my_availability('taking', null)$$, 'P0001', 'blocked', 'a blocked account cannot');
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.set_my_availability('taking', null)$$, 'P0001', 'not_your_listing',
  'nor can a call with no account');
reset role;
select is((select availability from public.providers where slug = 'av-paul'), 'taking', 'the paused listing stores it');
select is((select count(*)::int from public.provider_public where slug = 'av-paul'), 0, 'but shows nowhere until it is live');
select ok((select availability is null from public.providers where slug = 'av-rhys')
          and (select availability is null from public.providers where slug = 'av-bea'), 'the refused ones store nothing');

-- ---------------------------------------------------------------- the admin
set local role authenticated;
select public.av_as('00000000-0000-0000-0000-000000008201');
select throws_ok($$select public.admin_set_availability('00000000-0000-0000-0000-0000000082b6', 'taking', null)$$,
  '42501', 'not admin', 'a trader cannot use the admin''s function');
select public.av_as('00000000-0000-0000-0000-0000000082a0');
select is(public.admin_set_availability('00000000-0000-0000-0000-0000000082b6', 'booked', public.av_today() + 10), 'av-free',
  'the admin sets an unlinked listing to booked');
select is(public.admin_get_provider('00000000-0000-0000-0000-0000000082b6') -> 'availability' ->> 'showing', 'booked',
  'admin_get_provider returns it');
select throws_ok($$select public.admin_set_availability('00000000-0000-0000-0000-0000000082b6', 'booked', public.av_today())$$,
  'P0001', 'until_not_future', 'with the same checks');
select throws_ok($$select public.admin_set_availability('00000000-0000-0000-0000-0000000082b4', 'taking', null)$$,
  '23514', 'provider removed', 'not on a removed listing');
select lives_ok($$select public.admin_set_availability('00000000-0000-0000-0000-0000000082b6', null, null)$$, 'and clears it');
reset role;
select is((select availability_status from public.provider_public where slug = 'av-free'), null, 'cleared by the admin');
select is((select count(*)::int from public.audit_log where action = 'admin_set_availability'
           and actor_id = '00000000-0000-0000-0000-0000000082a0' and target_id = '00000000-0000-0000-0000-0000000082b6'), 2,
  'both admin changes are audited, by the admin');

-- ---------------------------------------------------------------- expiry, worked out when read
update public.providers set availability = 'taking', available_until = null, availability_set_at = now() - interval '13 days'
where slug = 'av-tess';
select is((select availability_status from public.provider_public where slug = 'av-tess'), 'taking', 'taking still shows after 13 days');
update public.providers set availability_set_at = now() - interval '15 days' where slug = 'av-tess';
select ok((select availability_status is null and availability_set_at is null and availability_until is null
           from public.provider_public where slug = 'av-tess'), 'after 14 days it shows nothing at all');
update public.providers set availability = 'taking', available_until = public.av_today() - 1, availability_set_at = now() - interval '2 days'
where slug = 'av-tess';
select is((select availability_status from public.provider_public where slug = 'av-tess'), null, '"this week" ends with its week');
update public.providers set availability = 'booked', available_until = public.av_today(), availability_set_at = now() - interval '60 days'
where slug = 'av-tess';
select is((select availability_status from public.provider_public where slug = 'av-tess'), 'booked',
  'booked shows to the end of its date, however long ago it was set');
update public.providers set available_until = public.av_today() - 1 where slug = 'av-tess';
select is((select availability_status from public.provider_public where slug = 'av-tess'), null, 'and nothing after it');

-- ---------------------------------------------------------------- never ranks or badges
select ok(position('availab' in pg_get_functiondef('public.provider_stats(uuid)'::regprocedure)) = 0,
  'the score and figures don''t read availability');

select * from finish();
rollback;
