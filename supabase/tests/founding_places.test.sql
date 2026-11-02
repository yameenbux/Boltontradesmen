-- The founding offer's places (migration 000059): a count of listings holding a founding grant the admin hasn't
-- ended, for the server only, and nothing but a number.
begin;
select plan(7);

update public.settings set value = '["fp-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.fp_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.fp_as(uuid) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f9a0', 'fp-admin@example.com');
insert into public.profiles (user_id, role, display_name) values ('00000000-0000-0000-0000-00000000f9a0', 'admin', null);
insert into public.providers (id, slug, business_name, phone_e164, areas, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-00000000f9b1', 'fp-one', 'FP One', '+447700900981', array['BL1'], 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000f9b2', 'fp-two', 'FP Two', '+447700900982', array['BL1'], 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000f9b3', 'fp-gone', 'FP Gone', '+447700900983', array['BL1'], 'live', now(), '{}'::jsonb);

create temp table fp_base on commit drop as select public.founding_places_taken() as n;
grant select on fp_base to authenticated;

select ok(has_function_privilege('service_role', 'public.founding_places_taken()', 'execute')
          and not has_function_privilege('anon', 'public.founding_places_taken()', 'execute')
          and not has_function_privilege('authenticated', 'public.founding_places_taken()', 'execute'),
  'the server reads the count; visitors can''t call it');
select is(pg_get_function_result('public.founding_places_taken()'::regprocedure), 'integer', 'a number, nothing else');

select public.fp_as('00000000-0000-0000-0000-00000000f9a0');
set local role authenticated;
select public.admin_grant_pro('00000000-0000-0000-0000-00000000f9b1', current_date + 90, 'Founding trader');
select public.admin_grant_pro('00000000-0000-0000-0000-00000000f9b2', current_date + 90, 'Founding trader');
select public.admin_grant_pro('00000000-0000-0000-0000-00000000f9b3', current_date + 90, 'Founding trader');
reset role;
select is(public.founding_places_taken(), (select n from fp_base) + 3, 'each founding grant takes a place');

select public.fp_as('00000000-0000-0000-0000-00000000f9a0');
set local role authenticated;
select public.admin_grant_pro('00000000-0000-0000-0000-00000000f9b1', current_date + 120, 'Founding trader');
reset role;
select is(public.founding_places_taken(), (select n from fp_base) + 3, 'a changed date is still one place');

select public.fp_as('00000000-0000-0000-0000-00000000f9a0');
set local role authenticated;
select public.admin_revoke_pro_grant('00000000-0000-0000-0000-00000000f9b2');
reset role;
select is(public.founding_places_taken(), (select n from fp_base) + 2, 'a grant the admin ends frees its place');

update public.pro_grants set until = current_date - 1 where provider_id = '00000000-0000-0000-0000-00000000f9b1';
select is(public.founding_places_taken(), (select n from fp_base) + 2, 'a grant that has run out keeps its place');

update public.providers set status = 'removed' where id = '00000000-0000-0000-0000-00000000f9b3';
select is(public.founding_places_taken(), (select n from fp_base) + 1, 'a removed listing frees its place');

select * from finish();
rollback;
