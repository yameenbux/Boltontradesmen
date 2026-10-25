-- Auto-live sign-up (migration 000041): a trader's own form puts their listing live, linked to their account, with
-- the consent evidence; trades that need a check go live with no category; one listing per account; a listing the
-- admin made and linked goes live when its owner agrees on their page; the admin's "new, check me" list and Checked.
begin;
select plan(34);

update public.settings set value = '["al-admin@example.com"]'::jsonb where key = 'admin_emails';
create function public.al_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.al_as(uuid) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000098a0', 'al-admin@example.com');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000009801', 'sam@al.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009802', 'gail@al.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009803', 'ivy@al.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009804', 'blocked@al.example', now(), '{"provider":"google"}');
insert into public.profiles (user_id, role, display_name, blocked_at) values
  ('00000000-0000-0000-0000-0000000098a0', 'admin', null, null),
  ('00000000-0000-0000-0000-000000009801', 'resident', 'Sam S.', null),
  ('00000000-0000-0000-0000-000000009802', 'resident', 'Gail G.', null),
  ('00000000-0000-0000-0000-000000009803', 'resident', 'Ivy I.', null),
  ('00000000-0000-0000-0000-000000009804', 'resident', 'Bo B.', now());
-- A listing the admin made from a request and linked, not yet agreed to.
insert into public.providers (id, slug, business_name, phone_e164, areas, status, user_id) values
  ('00000000-0000-0000-0000-0000000098b1', 'al-ivy', 'Ivy Electrics', '+447700900981', array['BL1'], 'invited',
   '00000000-0000-0000-0000-000000009803');

create temp table al_ev as select jsonb_build_object('ip', '203.0.113.9', 'text_version', '2026-10-17',
  'text_sha256', repeat('a', 64), 'owner_legal_name', 'YSB Ventures Ltd', 'contact_email', 'support@example.com') as ev;
grant select on al_ev to service_role, authenticated;

-- ---------------------------------------------------------------- access
select ok(not has_function_privilege('authenticated', 'public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb, jsonb)', 'execute')
          and has_function_privilege('service_role', 'public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb, jsonb)', 'execute'),
  'publishing: the server only');
select ok(not has_function_privilege('authenticated', 'public.trader_agree_listing(uuid, uuid, jsonb)', 'execute'),
  'agreeing: the server only');
select ok(not has_function_privilege('anon', 'public.admin_mark_provider_reviewed(uuid)', 'execute'), 'Checked: signed in');

-- ---------------------------------------------------------------- publishing
set local role service_role;
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009801', 'Sam Sparks', 'Sam Smith', array['electrician'],
  array['BL2'], '+447700900982', null, 'sam@al.example', 'free', 'ip-al1', '{}'::jsonb)->>'result', 'invalid',
  'not without the consent evidence');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009801', 'Sam Sparks', 'Sam Smith', '{}',
  array['BL2'], '+447700900982', null, 'sam@al.example', 'free', 'ip-al1', (select ev from al_ev))->>'result', 'invalid',
  'not without a trade');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009801', 'Sam Sparks', 'Sam Smith', array['electrician'],
  '{}', '+447700900982', null, 'sam@al.example', 'free', 'ip-al1', (select ev from al_ev))->>'result', 'invalid',
  'not without an area');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009804', 'Bo Builds', 'Bo B', array['electrician'],
  array['BL2'], '+447700900984', null, null, 'free', 'ip-al4', (select ev from al_ev))->>'result', 'not_allowed',
  'not for a blocked account');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009801', 'Sam Sparks', 'Sam Smith',
  array['electrician', 'cctv-security'], array['bl2', 'BL3', 'BL2'], '+447700900982', '+447700900986', 'sam@al.example',
  'pro', 'ip-al1', (select ev from al_ev))->>'result', 'ok',
  'a trader''s own form puts them live');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009801', 'Sam Again', 'Sam Smith', array['electrician'],
  array['BL2'], '+447700900983', null, 'sam@al.example', 'free', 'ip-al2', (select ev from al_ev))->>'result', 'already',
  'one listing per account');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009802', 'Gail Copy', 'Gail G', array['electrician'],
  array['BL2'], '+447700900986', null, null, 'free', 'ip-al5', (select ev from al_ev))->>'result', 'duplicate',
  'not with a number already on a listing (its WhatsApp counts)');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009802', 'Gail Gas', 'Gail G', array['gas-boilers'],
  array['M26'], '+447700900985', null, null, 'free', 'ip-al3', (select ev from al_ev))->>'result', 'invalid',
  'a trade that needs a check needs its number');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009802', 'Gail Gas', 'Gail G', array['gas-boilers'],
  array['M26'], '+447700900985', null, null, 'free', 'ip-al3', (select ev from al_ev),
  jsonb_build_object('gas_safe', jsonb_build_object('ref', '123456', 'expires', (current_date - 1)::text)))->>'result', 'invalid',
  'and an expiry that hasn''t passed');
select is(public.trader_publish_listing('00000000-0000-0000-0000-000000009802', 'Gail Gas', 'Gail G', array['gas-boilers'],
  array['M26'], '+447700900985', null, null, 'free', 'ip-al3', (select ev from al_ev),
  jsonb_build_object('gas_safe', jsonb_build_object('ref', 'ab1234', 'expires', (current_date + 300)::text)))->>'result', 'ok',
  'with them, it still goes live');
reset role;

select is((select status::text from public.providers where business_name = 'Sam Sparks'), 'live', 'live straight away');
select is((select user_id from public.providers where business_name = 'Sam Sparks'), '00000000-0000-0000-0000-000000009801'::uuid,
  'linked to their account');
select is((select areas from public.providers where business_name = 'Sam Sparks'), array['BL2', 'BL3'],
  'the areas they ticked, tidied');
select is((select whatsapp_e164 from public.providers where business_name = 'Sam Sparks'), '+447700900986', 'their WhatsApp number');
select is((select array_agg(c.slug order by c.slug) from public.provider_categories pc join public.categories c on c.id = pc.category_id
           join public.providers p on p.id = pc.provider_id where p.business_name = 'Sam Sparks'), array['cctv-security', 'electrician'],
  'listed under the trades they ticked');
select ok((select consent_evidence->>'via' = 'sign_up' and consent_evidence->>'text_sha256' = repeat('a', 64)
                  and consent_at is not null and consent_token_used_at is not null
           from public.providers where business_name = 'Sam Sparks'),
  'the consent evidence is kept, and the consent link is spent');
select ok((select reviewed_at is null and signup_trade is null from public.providers where business_name = 'Sam Sparks'),
  'waiting for the admin''s check; the trade matched, so nothing to note');
select is((select role::text from public.profiles where user_id = '00000000-0000-0000-0000-000000009801'), 'provider',
  'the account is a trader''s');
select is((select status || '|' || plan from public.listing_requests where business_name = 'Sam Sparks'), 'done|pro',
  'the request is kept as the record, done, with the plan');
select ok((select not exists (select 1 from public.provider_categories pc where pc.provider_id = p.id)
                  and p.signup_trade = 'Gas & boilers' and p.areas = array['M26']
           from public.providers p where p.business_name = 'Gail Gas'),
  'Gas Safe trades wait for the admin: no category yet, the trade noted');

-- ---------------------------------------------------------------- agreeing on the listing page
set local role service_role;
select is(public.trader_agree_listing('00000000-0000-0000-0000-000000009802', '00000000-0000-0000-0000-0000000098b1',
  (select ev from al_ev)), 'invalid', 'only the listing''s own account');
select is(public.trader_agree_listing('00000000-0000-0000-0000-000000009803', '00000000-0000-0000-0000-0000000098b1',
  (select ev from al_ev)), 'ok', 'its owner agrees');
select is(public.trader_agree_listing('00000000-0000-0000-0000-000000009803', '00000000-0000-0000-0000-0000000098b1',
  (select ev from al_ev)), 'invalid', 'once');
reset role;
select is((select status::text || '|' || (consent_evidence->>'via') from public.providers where slug = 'al-ivy'),
  'live|listing_page', 'and it''s live, with the evidence');

-- ---------------------------------------------------------------- admin
create temp table al_sam as select id from public.providers where business_name = 'Sam Sparks';
grant select on al_sam to authenticated;
set local role authenticated;
select al_as('00000000-0000-0000-0000-000000009801');
select throws_ok($$ select public.admin_mark_provider_reviewed((select id from al_sam)) $$,
  '42501', null, 'only the admin marks a listing checked');
select al_as('00000000-0000-0000-0000-0000000098a0');
select ok((select bool_and(e->>'reviewed_at' is null)
           from (select e, ord from jsonb_array_elements(public.admin_list_providers()) with ordinality as t(e, ord) order by ord limit 2) x),
  'listings not yet checked come first');
select public.admin_mark_provider_reviewed((select id from al_sam));
select ok((public.admin_get_provider((select id from al_sam))->>'reviewed_at') is not null
          and (public.admin_get_provider((select id from al_sam))->>'owner_email') = 'sam@al.example',
  'Checked is recorded; the admin sees the account''s email');

-- ---------------------------------------------------------------- confirming a check number
reset role;
create temp table al_gail as select id from public.providers where business_name = 'Gail Gas';
grant select on al_gail to authenticated;
select is((select signup_refs->'gas_safe'->>'ref' || '|' || (signup_refs->'gas_safe'->>'slug') from public.providers where business_name = 'Gail Gas'),
  'AB1234|gas-boilers', 'the number waits for the admin');
set local role authenticated;
select al_as('00000000-0000-0000-0000-000000009801');
select throws_ok($$ select public.admin_confirm_signup_check((select id from al_gail), 'gas_safe') $$, '42501', null,
  'only the admin confirms a number');
select al_as('00000000-0000-0000-0000-0000000098a0');
select throws_ok($$ select public.admin_confirm_signup_check((select id from al_gail), 'dvsa_adi') $$, 'P0001', 'nothing_to_confirm',
  'only a number that was given');
select public.admin_confirm_signup_check((select id from al_gail), 'gas_safe');
reset role;
select ok((select exists (select 1 from public.provider_checks k where k.provider_id = p.id and k.kind = 'gas_safe'
                          and k.reference = 'AB1234' and k.expires_on = current_date + 300)
                  and exists (select 1 from public.provider_categories pc join public.categories c on c.id = pc.category_id
                              where pc.provider_id = p.id and c.slug = 'gas-boilers')
                  and p.signup_refs is null and p.signup_trade is null
           from public.providers p where p.business_name = 'Gail Gas'),
  'confirmed: the check is recorded, the trade added, nothing left waiting');

select * from finish();
rollback;
