-- Trader logos and the Pro cover colour (migration 000052): a trader sets or clears their own logo (any plan), only
-- with a path inside their own folder; the cover colour needs Pro and comes from a fixed set; the public view shows
-- the logo always and the colour only while Pro is on; nobody else can touch either.
begin;
select plan(20);

create function public.tl_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function public.tl_as(uuid) to authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000a101'), ('00000000-0000-0000-0000-00000000a102');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000a101', 'provider', 'Lia L.'),
  ('00000000-0000-0000-0000-00000000a102', 'provider', 'Max M.');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-00000000a1b1', 'tl-lia', 'TL Lia', '+447700900971', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000a101'),
  ('00000000-0000-0000-0000-00000000a1b2', 'tl-max', 'TL Max', '+447700900972', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000a102');

-- Called through the API's read path it would run read-only, and my_listing locks the row.
select is((select provolatile from pg_proc where oid = 'public.my_branding(uuid)'::regprocedure), 'v',
  'my_branding is not marked stable');
select ok(not has_function_privilege('anon', 'public.set_my_logo(uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.set_my_brand_color(uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.my_branding(uuid)', 'execute'),
  'visitors can''t call the branding functions');

-- ---------------------------------------------------------------- Lia's logo (Free)
select public.tl_as('00000000-0000-0000-0000-00000000a101');
set local role authenticated;
select is(public.set_my_logo('00000000-0000-0000-0000-00000000a1b1',
  '00000000-0000-0000-0000-00000000a1b1/11111111-1111-1111-1111-111111111111.webp'), null, 'first logo: no old path');
select is(public.set_my_logo('00000000-0000-0000-0000-00000000a1b1',
  '00000000-0000-0000-0000-00000000a1b1/22222222-2222-2222-2222-222222222222.webp'),
  '00000000-0000-0000-0000-00000000a1b1/11111111-1111-1111-1111-111111111111.webp', 'a new logo hands back the old path');
select throws_ok($$select public.set_my_logo('00000000-0000-0000-0000-00000000a1b1',
  '00000000-0000-0000-0000-00000000a1b2/33333333-3333-3333-3333-333333333333.webp')$$, 'P0001', 'bad_path',
  'not a path in someone else''s folder');
select throws_ok($$select public.set_my_logo('00000000-0000-0000-0000-00000000a1b1',
  '00000000-0000-0000-0000-00000000a1b1/../x.webp')$$, 'P0001', 'bad_path', 'no ".." paths');
select throws_ok($$select public.set_my_logo('00000000-0000-0000-0000-00000000a1b1',
  '00000000-0000-0000-0000-00000000a1b1/logo.png')$$, 'P0001', 'bad_path', 'only the app''s own file names');
select throws_ok($$select public.set_my_logo('00000000-0000-0000-0000-00000000a1b2', null)$$, 'P0001',
  'not_your_listing', 'not someone else''s logo');
select throws_ok($$select public.my_branding('00000000-0000-0000-0000-00000000a1b2')$$, 'P0001',
  'not_your_listing', 'nor reading someone else''s branding');
select is(public.my_branding('00000000-0000-0000-0000-00000000a1b1') ->> 'logo_path',
  '00000000-0000-0000-0000-00000000a1b1/22222222-2222-2222-2222-222222222222.webp', 'Lia sees her logo');
select throws_ok($$select public.set_my_brand_color('00000000-0000-0000-0000-00000000a1b1', 'teal')$$, 'P0001',
  'not_pro', 'the cover colour needs Pro');
select lives_ok($$select public.set_my_brand_color('00000000-0000-0000-0000-00000000a1b1', null)$$,
  'clearing it doesn''t');
reset role;

select is((select logo_path from public.provider_public where slug = 'tl-lia'),
  '00000000-0000-0000-0000-00000000a1b1/22222222-2222-2222-2222-222222222222.webp', 'the logo shows publicly');
select ok(exists (select 1 from public.audit_log where action = 'logo_set' and target_id = '00000000-0000-0000-0000-00000000a1b1'),
  'setting a logo is audited');

-- ---------------------------------------------------------------- Pro and the colour
insert into public.subscriptions (provider_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, stripe_as_of)
values ('00000000-0000-0000-0000-00000000a1b1', 'cus_tl1', 'sub_tl1', 'monthly', 'active', now() + interval '20 days', now());
select public.tl_as('00000000-0000-0000-0000-00000000a101');
set local role authenticated;
select lives_ok($$select public.set_my_brand_color('00000000-0000-0000-0000-00000000a1b1', 'teal')$$, 'Pro: colour set');
select throws_ok($$select public.set_my_brand_color('00000000-0000-0000-0000-00000000a1b1', '#ff0000')$$, 'P0001',
  'bad_color', 'only the fixed colours');
select is(public.set_my_logo('00000000-0000-0000-0000-00000000a1b1', null),
  '00000000-0000-0000-0000-00000000a1b1/22222222-2222-2222-2222-222222222222.webp', 'removing the logo hands back its path');
reset role;
select is((select brand_color from public.provider_public where slug = 'tl-lia'), 'teal', 'the colour shows while Pro');
select is((select logo_path from public.provider_public where slug = 'tl-lia'), null, 'and the logo is gone');

update public.subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_tl1';
select is((select brand_color from public.provider_public where slug = 'tl-lia'), null, 'no colour once Pro ends');

select * from finish();
rollback;
