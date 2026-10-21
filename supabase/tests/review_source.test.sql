-- Review request cards (migration 000027): reviews.source records 'card' when the person came through the
-- trader's review link (?ref=card). submit_review takes it from the answers' jsonb and stores only 'card';
-- edits keep it; the admin's review JSON carries it; nothing public or trader-facing shows it.
begin;
select plan(17);

update public.settings set value = '["rs-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.rs_submit(p_uid uuid, p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.submit_review(p_uid, p, h) $$;
create function public.rs_edit(p_uid uuid, p_id uuid, p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.edit_review(p_uid, p_id, p, h) $$;
create function public.rs_p(p_provider uuid, p_extra jsonb default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object(
    'provider_id', p_provider, 'category_id', (select id from public.categories where slug = 'plumber'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', 4, 'tidy', true, 'use_again', 'yes',
    'comment', 'Review source test') || p_extra;
$$;
create function public.rs_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.rs_as(uuid) to authenticated;

create function pg_temp.google_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at)
  values (p_id, p_email, now() - interval '3 days', '{"provider":"google"}', now() - interval '3 days');
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values ('sub-' || p_id::text, p_id, jsonb_build_object('sub', 'sub-' || p_id::text, 'email', p_email), 'google');
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
end $$;
create function pg_temp.email_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-rs', 'approved', encode(sha256(convert_to('n-' || p_id::text, 'UTF8')), 'hex'));
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at)
  values (p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text), '{"provider":"email"}', now() - interval '3 days');
  update auth.users set email_confirmed_at = now() - interval '3 days' where id = p_id;
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005a0', 'rs-admin@example.com');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000005a0', 'admin');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000005b1', 'rs-one', 'RS One', '+447700900921', 'live', now(), '{}'::jsonb);
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p, public.categories c where p.slug = 'rs-one' and c.slug = 'plumber';

select pg_temp.google_user('00000000-0000-0000-0000-000000000501', 'rs-card@example.org', 'Cara C.');
select pg_temp.google_user('00000000-0000-0000-0000-000000000502', 'rs-plain@example.org', 'Pat P.');
select pg_temp.google_user('00000000-0000-0000-0000-000000000503', 'rs-odd@example.org', 'Olly O.');
select pg_temp.email_user('00000000-0000-0000-0000-000000000504', 'rs-held@example.org', 'Hana H.');

-- ---------------------------------------------------------------- the column
select has_column('public', 'reviews', 'source', 'reviews has a source column');
select col_type_is('public', 'reviews', 'source', 'text', 'source is text');
select col_is_null('public', 'reviews', 'source', 'source is optional');
select col_hasnt_default('public', 'reviews', 'source', 'with no default');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000005c1');
select throws_ok($$
  insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again, source)
  values ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005c1',
          (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date,
          '<250', 'yes', 'yes', 4, 'yes', 'flyer')
$$, '23514', null, 'only card is allowed');

-- ---------------------------------------------------------------- submit_review
create temp table r (k text primary key, id uuid, status text);
grant all on r to authenticated;
insert into r select 'card', (x ->> 'id')::uuid, x ->> 'status' from public.rs_submit('00000000-0000-0000-0000-000000000501',
  public.rs_p('00000000-0000-0000-0000-0000000005b1', '{"source":"card"}'), 'd-cara') x;
insert into r select 'plain', (public.rs_submit('00000000-0000-0000-0000-000000000502',
  public.rs_p('00000000-0000-0000-0000-0000000005b1'), 'd-pat') ->> 'id')::uuid;
insert into r select 'odd', (public.rs_submit('00000000-0000-0000-0000-000000000503',
  public.rs_p('00000000-0000-0000-0000-0000000005b1', '{"source":"flyer"}'), 'd-olly') ->> 'id')::uuid;
insert into r select 'held', (public.rs_submit('00000000-0000-0000-0000-000000000504',
  public.rs_p('00000000-0000-0000-0000-0000000005b1', '{"source":"card"}'), 'd-hana') ->> 'id')::uuid;

select is((select source from public.reviews where id = (select id from r where k = 'card')), 'card',
  'a review from the card records source card');
select is((select source from public.reviews where id = (select id from r where k = 'plain')), null,
  'a review with no source records none');
select is((select source from public.reviews where id = (select id from r where k = 'odd')), null,
  'an unknown source is stored as none, not refused');
select is((select status from r where k = 'card'), 'published',
  'the source changes nothing else: a Google account''s card review still publishes');

-- An edit keeps the source (and can't set or clear it).
select public.rs_edit('00000000-0000-0000-0000-000000000501', (select id from r where k = 'card'),
  public.rs_p('00000000-0000-0000-0000-0000000005b1', '{"quality":3}') - 'provider_id', 'd-cara');
select public.rs_edit('00000000-0000-0000-0000-000000000502', (select id from r where k = 'plain'),
  public.rs_p('00000000-0000-0000-0000-0000000005b1', '{"source":"card"}') - 'provider_id', 'd-pat');
select is((select source from public.reviews where id = (select id from r where k = 'card')), 'card', 'an edit keeps the source');
select is((select source from public.reviews where id = (select id from r where k = 'plain')), null, 'an edit cannot add one');

-- ---------------------------------------------------------------- who can see it
set local role authenticated;
select public.rs_as('00000000-0000-0000-0000-0000000005a0');
select is((select x ->> 'source' from jsonb_array_elements(public.admin_list_reviews_pending()) x
           where x ->> 'id' = (select id::text from r where k = 'held')), 'card',
  'the admin''s held-review queue shows the source');
reset role;
select is(private.admin_review_json((select id from r where k = 'plain')) ->> 'source', null,
  'and none when there is none');
select hasnt_column('public', 'review_public', 'source', 'the public review view has no source');
select ok(position('source' in pg_get_functiondef('public.provider_my_reviews()'::regprocedure)) = 0,
  'the trader''s own review list does not read it');

-- ---------------------------------------------------------------- grants unchanged
select ok(not has_function_privilege('anon', 'public.submit_review(uuid, jsonb, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.submit_review(uuid, jsonb, text)', 'execute'),
  'submit_review is still not callable by anon or authenticated');
select ok(has_function_privilege('service_role', 'public.submit_review(uuid, jsonb, text)', 'execute'),
  'submit_review is still callable by the service role');

select * from finish();
rollback;
