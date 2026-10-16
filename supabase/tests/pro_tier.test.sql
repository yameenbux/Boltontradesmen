-- Pro (migration 000030): Stripe's subscriptions written once per event and never by browsers; is_pro's rules; the
-- trader's ID documents and work photos (only while Pro, photos removable any time); the admin's decisions, audited;
-- and the public view showing only "ID checked" and the photos, and only while Pro is on.
begin;
select plan(87);

update public.settings set value = '["pt-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.pt_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.pt_as(uuid) to authenticated;
-- A subscription for the listing, as the webhook would write it.
create function public.pt_sub(p_event text, p_provider uuid, p_sub text, p_status text, p_end timestamptz,
                              p_as_of timestamptz default now()) returns jsonb language sql as $$
  select public.stripe_apply_event(p_event, 'customer.subscription.updated', jsonb_build_object(
    'provider_id', p_provider, 'customer', 'cus_pt' || left(p_provider::text, 4), 'subscription', p_sub,
    'plan', 'monthly', 'status', p_status, 'current_period_end', p_end, 'cancel_at_period_end', false,
    'as_of', p_as_of));
$$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000094a0', 'pt-admin@example.com');
insert into auth.users (id) values ('00000000-0000-0000-0000-000000009401'), ('00000000-0000-0000-0000-000000009402');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000094a0', 'admin', null),
  ('00000000-0000-0000-0000-000000009401', 'provider', 'Pat P.'),
  ('00000000-0000-0000-0000-000000009402', 'provider', 'Kim K.');
-- Pat: pt-pro (will be Pro). Kim: pt-free (never Pro). pt-lone: unlinked, for is_pro's rules.
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000094b1', 'pt-pro', 'PT Pro', '+447700900961', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009401'),
  ('00000000-0000-0000-0000-0000000094b2', 'pt-free', 'PT Free', '+447700900962', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009402'),
  ('00000000-0000-0000-0000-0000000094b3', 'pt-lone', 'PT Lone', '+447700900963', 'live', now(), '{}'::jsonb, null);

-- ---------------------------------------------------------------- nobody reads the tables directly
select ok(not has_table_privilege('anon', 'public.subscriptions', 'select')
          and not has_table_privilege('authenticated', 'public.subscriptions', 'select')
          and not has_table_privilege('service_role', 'public.subscriptions', 'select'),
  'subscriptions: no table access, not even the service role (functions only)');
select ok(not has_table_privilege('authenticated', 'public.stripe_events', 'select')
          and not has_table_privilege('authenticated', 'public.pro_documents', 'select')
          and not has_table_privilege('authenticated', 'public.work_photos', 'select')
          and not has_table_privilege('anon', 'public.work_photos', 'select'),
  'events, documents and photos: no table access');
select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.subscriptions'::regclass, 'public.stripe_events'::regclass, 'public.pro_documents'::regclass,
   'public.work_photos'::regclass)), 'row level security is on for all four');
select ok(not has_function_privilege('anon', 'public.stripe_apply_event(text, text, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.stripe_apply_event(text, text, jsonb)', 'execute')
          and has_function_privilege('service_role', 'public.stripe_apply_event(text, text, jsonb)', 'execute'),
  'stripe_apply_event: service role only');
select ok(not has_function_privilege('authenticated', 'public.stripe_reconcile_subscription(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.stripe_list_subscriptions()', 'execute')
          and not has_function_privilege('authenticated', 'public.stripe_customer_for(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.stripe_event_seen(text)', 'execute'),
  'the other Stripe functions: service role only');
select ok(not has_function_privilege('anon', 'public.my_pro_status(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.add_my_work_photo(uuid, text, int, int)', 'execute')
          and not has_function_privilege('anon', 'public.add_my_pro_document(uuid, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.admin_decide_pro_document(uuid, text, text)', 'execute'),
  'the trader and admin functions need a signed-in account');
select ok(not has_function_privilege('authenticated', 'private.upsert_subscription(jsonb, text)', 'execute')
          and not has_function_privilege('authenticated', 'private.my_pro_listing(uuid, boolean)', 'execute'),
  'the private writers are not callable directly');

-- ---------------------------------------------------------------- the public view before Pro
select ok((select not id_checked and photos = '[]'::jsonb from public.provider_public where slug = 'pt-pro'),
  'not Pro: no ID checked mark and no photos');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'provider_public' and column_name ~ '(pro|plan|subscription|stripe|status$)' and column_name <> 'availability_status'),
  'provider_public has no billing column');

-- ---------------------------------------------------------------- is_pro's rules
set local role service_role;
select is(public.pt_sub('evt_pt_l1', '00000000-0000-0000-0000-0000000094b3', 'sub_ptlone', 'active', now() + interval '20 days') ->> 'outcome',
  'applied', 'a new subscription is applied');
reset role;
select ok(private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'active is Pro');
update public.subscriptions set status = 'trialing' where stripe_subscription_id = 'sub_ptlone';
select ok(private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'trialing is Pro');
update public.subscriptions set status = 'past_due', current_period_end = now() - interval '13 days' where stripe_subscription_id = 'sub_ptlone';
select ok(private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'past due within 14 days of the period end is Pro');
update public.subscriptions set current_period_end = now() - interval '15 days' where stripe_subscription_id = 'sub_ptlone';
select ok(not private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'past due longer than that is not');
update public.subscriptions set status = 'past_due', current_period_end = null where stripe_subscription_id = 'sub_ptlone';
select ok(not private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'past due with no period end is not');
update public.subscriptions set status = 'canceled', current_period_end = now() + interval '5 days' where stripe_subscription_id = 'sub_ptlone';
select ok(not private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'canceled is not Pro');
update public.subscriptions set status = 'incomplete' where stripe_subscription_id = 'sub_ptlone';
select ok(not private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'incomplete (checkout not paid) is not Pro');
update public.subscriptions set status = 'unpaid' where stripe_subscription_id = 'sub_ptlone';
select ok(not private.is_pro('00000000-0000-0000-0000-0000000094b3'), 'unpaid is not Pro');

-- ---------------------------------------------------------------- webhook events: once each, newest data wins
set local role service_role;
select is(public.pt_sub('evt_pt_1', '00000000-0000-0000-0000-0000000094b1', 'sub_ptpro', 'active', now() + interval '30 days') ->> 'slug',
  'pt-pro', 'applied, with the slug to refresh');
select is(public.pt_sub('evt_pt_1', '00000000-0000-0000-0000-0000000094b1', 'sub_ptpro', 'canceled', now()) ->> 'outcome',
  'duplicate', 'the same event again changes nothing');
select ok(public.stripe_event_seen('evt_pt_1'), 'the event is remembered');
select is(public.pt_sub('evt_pt_old', '00000000-0000-0000-0000-0000000094b1', 'sub_ptpro', 'canceled', now(), now() - interval '1 hour') ->> 'outcome',
  'stale', 'an older event arriving late does not overwrite newer data');
select is(public.pt_sub('evt_pt_same', '00000000-0000-0000-0000-0000000094b1', 'sub_ptpro', 'active',
  now() + interval '30 days') ->> 'outcome',
  'unchanged', 'the same data again is unchanged');
select is(public.pt_sub('evt_pt_steal', '00000000-0000-0000-0000-0000000094b2', 'sub_ptpro', 'active', now() + interval '30 days') ->> 'slug',
  'pt-pro', 'a subscription stays with the listing it was bought for');
select is(public.pt_sub('evt_pt_ghost', '00000000-0000-0000-0000-0000000094ff', 'sub_ptghost', 'active', now()) ->> 'outcome',
  'unknown_provider', 'a subscription for an unknown listing is not stored');
select is(public.stripe_apply_event('evt_pt_other', 'invoice.paid', null) ->> 'outcome', 'recorded',
  'an event with nothing to apply is just recorded');
select is(public.stripe_customer_for('00000000-0000-0000-0000-0000000094b1'), 'cus_pt0000', 'the customer for the billing portal');
select is(jsonb_array_length(public.stripe_list_subscriptions()), 2, 'the reconciliation list has both subscriptions');
select is(public.stripe_reconcile_subscription(jsonb_build_object('customer', 'cus_pt0000', 'subscription', 'sub_ptpro',
  'plan', 'annual', 'status', 'active', 'current_period_end', now() + interval '365 days', 'cancel_at_period_end', true)) ->> 'outcome',
  'applied', 'reconciliation fixes drift (no provider needed for a known subscription)');
reset role;
select is((select plan || '/' || cancel_at_period_end from public.subscriptions where stripe_subscription_id = 'sub_ptpro'),
  'annual/true', 'the reconciled values are stored');
select is((select count(*)::int from public.audit_log where action = 'stripe_subscription'
           and target_id = '00000000-0000-0000-0000-0000000094b1'), 1, 'each applied change is audited once');
select is((select count(*)::int from public.audit_log where action = 'stripe_reconcile'), 1, 'and so is reconciliation');
select is((select count(*)::int from public.stripe_events where id like 'evt_pt_%'), 7, 'every event id is kept');
select throws_ok($$select public.stripe_apply_event('evt_pt_bad', 'x', '{"subscription":"sub_x"}'::jsonb)$$, 'P0001',
  'bad_subscription', 'an incomplete subscription is refused');

-- Pro, but nothing approved or added yet.
select ok((select not id_checked and photos = '[]'::jsonb from public.provider_public where slug = 'pt-pro'),
  'Pro alone shows nothing publicly');

-- ---------------------------------------------------------------- the trader's photos
select public.pt_as('00000000-0000-0000-0000-000000009402');
set local role authenticated;
select throws_ok($$select public.add_my_work_photo('00000000-0000-0000-0000-0000000094b2', '00000000-0000-0000-0000-0000000094b2/a.webp', 800, 600)$$,
  'P0001', 'not_pro', 'photos need Pro');
select throws_ok($$select public.add_my_work_photo('00000000-0000-0000-0000-0000000094b1', '00000000-0000-0000-0000-0000000094b1/a.webp', 800, 600)$$,
  'P0001', 'not_your_listing', 'not on someone else''s listing');
select throws_ok($$select public.my_pro_status('00000000-0000-0000-0000-0000000094b1')$$, 'P0001', 'not_your_listing',
  'nor reading someone else''s Pro');
select is((public.my_pro_status('00000000-0000-0000-0000-0000000094b2') ->> 'is_pro')::boolean, false, 'Kim is not Pro');
reset role;

select public.pt_as('00000000-0000-0000-0000-000000009401');
set local role authenticated;
select throws_ok($$select public.add_my_work_photo('00000000-0000-0000-0000-0000000094b1', '00000000-0000-0000-0000-0000000094b2/a.webp', 800, 600)$$,
  'P0001', 'bad_path', 'a photo must be stored under the listing''s own folder');
select throws_ok($$select public.add_my_work_photo('00000000-0000-0000-0000-0000000094b1', '00000000-0000-0000-0000-0000000094b1/../x.webp', 800, 600)$$,
  'P0001', 'bad_path', 'no climbing out of it');
select throws_ok($$select public.add_my_work_photo('00000000-0000-0000-0000-0000000094b1', '00000000-0000-0000-0000-0000000094b1/a.webp', 0, 600)$$,
  'P0001', 'bad_size', 'a size is needed');
select is(public.add_my_work_photo('00000000-0000-0000-0000-0000000094b1', '00000000-0000-0000-0000-0000000094b1/p' || n || '.webp', 800, 600),
  'pt-pro', 'photo ' || n || ' added') from generate_series(1, 6) n;
select throws_ok($$select public.add_my_work_photo('00000000-0000-0000-0000-0000000094b1', '00000000-0000-0000-0000-0000000094b1/p7.webp', 800, 600)$$,
  'P0001', 'too_many_photos', 'no more than 6');
create temp table pt_ids on commit drop as
  select array_agg((x ->> 'id')::uuid order by (x ->> 'position')::int) as ids
  from jsonb_array_elements(public.my_pro_status('00000000-0000-0000-0000-0000000094b1') -> 'photos') x;
select throws_ok($$select public.reorder_my_work_photos('00000000-0000-0000-0000-0000000094b1', (select ids[1:5] from pt_ids))$$,
  'P0001', 'bad_order', 'a new order must include every photo');
select throws_ok($$select public.reorder_my_work_photos('00000000-0000-0000-0000-0000000094b1', (select ids[1:5] || ids[1] from pt_ids))$$,
  'P0001', 'bad_order', 'each once');
select is(public.reorder_my_work_photos('00000000-0000-0000-0000-0000000094b1',
  (select array[ids[6]] || ids[1:5] from pt_ids)), 'pt-pro', 'reordered: the last first');
select is(public.remove_my_work_photo('00000000-0000-0000-0000-0000000094b1', (select ids[3] from pt_ids)) ->> 'path',
  '00000000-0000-0000-0000-0000000094b1/p3.webp', 'removing a photo returns its file to delete');
select throws_ok($$select public.remove_my_work_photo('00000000-0000-0000-0000-0000000094b1', (select ids[3] from pt_ids))$$,
  'P0001', 'photo_not_found', 'and it can''t be removed twice');
reset role;
select is((select jsonb_agg(x ->> 'path') from public.provider_public, jsonb_array_elements(photos) x where slug = 'pt-pro'),
  '["00000000-0000-0000-0000-0000000094b1/p6.webp", "00000000-0000-0000-0000-0000000094b1/p1.webp", "00000000-0000-0000-0000-0000000094b1/p2.webp", "00000000-0000-0000-0000-0000000094b1/p4.webp", "00000000-0000-0000-0000-0000000094b1/p5.webp"]'::jsonb,
  'the profile shows the five, in the trader''s order');
select is((select array_agg(position order by position) from public.work_photos
           where provider_id = '00000000-0000-0000-0000-0000000094b1' and removed_at is null), array[1, 2, 3, 4, 5],
  'positions are renumbered after a removal');
select is((select photos -> 0 -> 'width' from public.provider_public where slug = 'pt-pro'), '800'::jsonb,
  'each photo carries its size');

-- ---------------------------------------------------------------- the trader's ID
select public.pt_as('00000000-0000-0000-0000-000000009401');
set local role authenticated;
select throws_ok($$select public.add_my_pro_document('00000000-0000-0000-0000-0000000094b1', 'passport', '00000000-0000-0000-0000-0000000094b1/id.jpg', 'image/jpeg')$$,
  'P0001', 'bad_kind', 'only photo ID, insurance or accreditation');
select throws_ok($$select public.add_my_pro_document('00000000-0000-0000-0000-0000000094b1', 'photo_id', '00000000-0000-0000-0000-0000000094b1/id.gif', 'image/gif')$$,
  'P0001', 'bad_type', 'photos or PDFs only');
create temp table pt_doc on commit drop as
  select public.add_my_pro_document('00000000-0000-0000-0000-0000000094b1', 'photo_id', '00000000-0000-0000-0000-0000000094b1/id.jpg', 'image/jpeg') as id;
select throws_ok($$select public.add_my_pro_document('00000000-0000-0000-0000-0000000094b1', 'photo_id', '00000000-0000-0000-0000-0000000094b1/id2.jpg', 'image/jpeg')$$,
  'P0001', 'id_pending', 'one photo ID waiting at a time');
select ok(public.add_my_pro_document('00000000-0000-0000-0000-0000000094b1', 'insurance', '00000000-0000-0000-0000-0000000094b1/ins.pdf', 'application/pdf') is not null,
  'optional insurance alongside');
select is(public.my_pro_status('00000000-0000-0000-0000-0000000094b1') -> 'id_check' ->> 'status', 'pending', 'the trader sees it waiting');
select throws_ok($$select public.admin_decide_pro_document((select id from pt_doc), 'approved', null)$$, '42501', 'not admin',
  'the trader cannot approve their own ID');
reset role;
select ok((select not id_checked from public.provider_public where slug = 'pt-pro'), 'waiting is not checked');

-- ---------------------------------------------------------------- the admin
select public.pt_as('00000000-0000-0000-0000-0000000094a0');
set local role authenticated;
select is((public.admin_counts() ->> 'pending_pro_documents')::int, 2, 'admin_counts: 2 documents waiting');
select is(jsonb_array_length(public.admin_pro_overview() -> 'pending'), 2, 'the Pro page lists them');
select is((select t ->> 'business_name' from jsonb_array_elements(public.admin_pro_overview() -> 'traders') t limit 1),
  'PT Pro', 'and the Pro traders, Pro first');
select is(public.admin_pro_document_path((select id from pt_doc)), '00000000-0000-0000-0000-0000000094b1/id.jpg',
  'the admin gets the file''s path for a short-lived link');
select throws_ok($$select public.admin_decide_pro_document((select id from pt_doc), 'rejected', '  ')$$, 'P0001',
  'reason_required', 'a rejection needs a reason');
select throws_ok($$select public.admin_decide_pro_document((select id from pt_doc), 'maybe', null)$$, 'P0001',
  'bad_decision', 'approve or reject only');
select is(public.admin_decide_pro_document((select id from pt_doc), 'approved', null), 'pt-pro', 'approved, with the slug');
select throws_ok($$select public.admin_decide_pro_document((select id from pt_doc), 'rejected', 'oops')$$, 'P0001',
  'already_decided', 'a decision stands');
select is((public.admin_provider_pro('00000000-0000-0000-0000-0000000094b1') ->> 'is_pro')::boolean, true,
  'the provider page shows Pro');
reset role;
select is((select count(*)::int from public.audit_log where action in ('view_pro_document', 'pro_document_approved')
           and actor_id = '00000000-0000-0000-0000-0000000094a0'), 2, 'the look and the approval are audited');
select ok((select id_checked from public.provider_public where slug = 'pt-pro'), 'approved and Pro: ID checked');

select public.pt_as('00000000-0000-0000-0000-000000009401');
set local role authenticated;
select throws_ok($$select public.add_my_pro_document('00000000-0000-0000-0000-0000000094b1', 'photo_id', '00000000-0000-0000-0000-0000000094b1/id3.jpg', 'image/jpeg')$$,
  'P0001', 'id_approved', 'no second photo ID once checked');
reset role;

-- ---------------------------------------------------------------- 30 days after the decision the file goes
update public.pro_documents set decided_at = now() - interval '31 days' where id = (select id from pt_doc);
select public.pt_as('00000000-0000-0000-0000-0000000094a0');
set local role authenticated;
select is((select array_agg(storage_path) from public.pro_id_files_due(10)), array['00000000-0000-0000-0000-0000000094b1/id.jpg'],
  'the ID file is due for deletion (the waiting insurance is not)');
select is(public.mark_pro_id_files_deleted(array[(select id from pt_doc)]), 1, 'marked once its file is gone');
select is(public.admin_pro_document_path((select id from pt_doc)), null, 'no file to show any more');
reset role;
select ok((select id_checked from public.provider_public where slug = 'pt-pro'), 'the decision is kept: still ID checked');

-- ---------------------------------------------------------------- lapse
set local role service_role;
select is(public.pt_sub('evt_pt_end', '00000000-0000-0000-0000-0000000094b1', 'sub_ptpro', 'canceled', now()) ->> 'outcome',
  'applied', 'the subscription ends');
reset role;
select ok((select not id_checked and photos = '[]'::jsonb from public.provider_public where slug = 'pt-pro'),
  'lapsed: the ID checked mark and the photos disappear');
select ok(exists (select 1 from public.provider_public where slug = 'pt-pro'), 'the listing stays');
select public.pt_as('00000000-0000-0000-0000-000000009401');
set local role authenticated;
select throws_ok($$select public.reorder_my_work_photos('00000000-0000-0000-0000-0000000094b1', '{}')$$, 'P0001', 'not_pro',
  'no reordering without Pro');
select is(public.remove_my_work_photo('00000000-0000-0000-0000-0000000094b1',
  (select (x ->> 'id')::uuid from jsonb_array_elements(public.my_pro_status('00000000-0000-0000-0000-0000000094b1') -> 'photos') x limit 1)) ->> 'slug',
  'pt-pro', 'but a photo can always be removed');
select is(public.my_pro_status('00000000-0000-0000-0000-0000000094b1') -> 'subscription' ->> 'status', 'canceled',
  'the trader sees it ended');
reset role;

-- ---------------------------------------------------------------- Pro changes nothing that ranks or badges
select ok(position('subscriptions' in pg_get_functiondef('public.provider_stats(uuid)'::regprocedure)) = 0
          and position('is_pro' in pg_get_functiondef('public.provider_stats(uuid)'::regprocedure)) = 0,
  'provider_stats (scores and badges) does not read Pro');

select * from finish();
rollback;
