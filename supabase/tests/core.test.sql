begin;
select plan(19);

-- fixtures
insert into public.providers (id, slug, business_name, phone_e164)
values ('00000000-0000-0000-0000-0000000000a1', 'test-pro', 'Test Pro Ltd', '+447700900001');

-- live requires consent
select throws_ok(
  $$update public.providers set status = 'live' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'live status requires consent_at');
select throws_like(
  $$update public.providers set status = 'live' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '%providers_live_requires_consent%', 'live constraint is named providers_live_requires_consent');

-- max 3 categories
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', id from public.categories
where slug in ('plumber', 'electrician', 'handyman');
select throws_ok(
  $$insert into public.provider_categories (provider_id, category_id)
    select '00000000-0000-0000-0000-0000000000a1', id from public.categories where slug = 'joiner'$$,
  null, 'max 3 categories', '4th category is rejected');

-- category requirement: gas_safe
delete from public.provider_categories where provider_id = '00000000-0000-0000-0000-0000000000a1';
select throws_ok(
  $$insert into public.provider_categories (provider_id, category_id)
    select '00000000-0000-0000-0000-0000000000a1', id from public.categories where slug = 'gas-boilers'$$,
  null, 'category requires gas_safe check', 'gas-boilers needs gas_safe check');
insert into public.provider_checks (provider_id, kind, reference, expires_on)
values ('00000000-0000-0000-0000-0000000000a1', 'gas_safe', '123456', current_date - 1);
select throws_ok(
  $$insert into public.provider_categories (provider_id, category_id)
    select '00000000-0000-0000-0000-0000000000a1', id from public.categories where slug = 'gas-boilers'$$,
  null, 'category requires gas_safe check', 'expired gas_safe check is not enough');
insert into public.provider_checks (provider_id, kind, reference, expires_on)
values ('00000000-0000-0000-0000-0000000000a1', 'gas_safe', '123456', current_date + 30);
select lives_ok(
  $$insert into public.provider_categories (provider_id, category_id)
    select '00000000-0000-0000-0000-0000000000a1', id from public.categories where slug = 'gas-boilers'$$,
  'gas-boilers allowed with in-date gas_safe check');

-- seed data
select is((select count(*) from public.category_groups), 6::bigint, '6 category groups');
select ok((select count(*) from public.categories) >= 38, 'at least 38 categories');
select is((select requirement::text from public.categories where slug = 'gas-boilers'), 'gas_safe', 'gas-boilers requires gas_safe');
select is((select requirement::text from public.categories where slug = 'driving-instructors'), 'dvsa_adi', 'driving-instructors requires dvsa_adi');
select is((select guidance_note from public.categories where slug = 'electrician'),
  'For rewires and new circuits, look for an NICEIC/NAPIT tick or ask about building control sign-off.',
  'electrician guidance note');
select is((select array_agg(slug order by slug) from public.category_groups where asks_tidy),
  array['home-trades', 'moving-waste'], 'asks_tidy only home-trades and moving-waste');
select is((select value from public.settings where key = 'enquiry_threshold'), '5'::jsonb, 'enquiry_threshold = 5');

-- UPDATE paths must not bypass the triggers
insert into public.providers (id, slug, business_name, phone_e164) values
  ('00000000-0000-0000-0000-0000000000a2', 'test-pro-2', 'Test Pro 2', '+447700900002'),
  ('00000000-0000-0000-0000-0000000000a3', 'test-pro-3', 'Test Pro 3', '+447700900003');
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000000a2', id from public.categories where slug = 'plumber';
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000000a3', id from public.categories where slug in ('plumber', 'electrician', 'handyman');
select throws_ok(
  $$update public.provider_categories set category_id = (select id from public.categories where slug = 'driving-instructors')
    where provider_id = '00000000-0000-0000-0000-0000000000a2'$$,
  null, 'category requires dvsa_adi check', 'UPDATE category_id cannot attach a required-check category');
select throws_ok(
  $$update public.provider_categories set provider_id = '00000000-0000-0000-0000-0000000000a3'
    where provider_id = '00000000-0000-0000-0000-0000000000a2'$$,
  null, 'max 3 categories', 'UPDATE provider_id cannot create a 4th category');
select lives_ok(
  $$update public.provider_categories set category_id = (select id from public.categories where slug = 'joiner')
    where provider_id = '00000000-0000-0000-0000-0000000000a3'
      and category_id = (select id from public.categories where slug = 'plumber')$$,
  'swapping a category at the limit is allowed');
select lives_ok(
  $$update public.provider_categories set category_id = (select id from public.categories where slug = 'tiler')
    where provider_id = '00000000-0000-0000-0000-0000000000a2'$$,
  'swapping to an unrestricted category is allowed');

-- is_admin
select is(public.is_admin(), false, 'is_admin false with no auth user');

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000000b1', 'admin');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(public.is_admin(), true, 'is_admin true for admin profile');

select * from finish();
rollback;
