-- One listing per phone number (000034): a second listing with the same number is refused unless the first one is
-- removed; a removed listing's number can be reused; moving a listing onto a taken number is refused too.
begin;
select plan(5);

insert into public.providers (id, slug, business_name, phone_e164) values
  ('d1000000-0000-0000-0000-000000000001', 'olpn-one', 'OLPN One', '+447700902001');

select throws_ok(
  $$insert into public.providers (slug, business_name, phone_e164) values ('olpn-two', 'OLPN Two', '+447700902001')$$,
  '23505', null, 'a second listing with the same number is refused');

insert into public.providers (id, slug, business_name, phone_e164) values
  ('d1000000-0000-0000-0000-000000000003', 'olpn-three', 'OLPN Three', '+447700902003');
select throws_ok(
  $$update public.providers set phone_e164 = '+447700902001' where id = 'd1000000-0000-0000-0000-000000000003'$$,
  '23505', null, 'moving a listing onto a number another listing has is refused');

update public.providers set status = 'removed' where id = 'd1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$insert into public.providers (slug, business_name, phone_e164) values ('olpn-four', 'OLPN Four', '+447700902001')$$,
  'once the first listing is removed, its number can be listed again');

select is((select count(*)::int from public.providers where phone_e164 = '+447700902001' and status <> 'removed'), 1,
  'still only one listing that is not removed');

select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'providers_one_listing_per_phone'),
  'the unique index is there');

select * from finish();
rollback;
