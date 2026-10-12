begin;
select plan(29);

select columns_are('public', 'provider_public', array[
  'id', 'slug', 'business_name', 'contact_name', 'areas', 'bio', 'is_verified', 'has_whatsapp',
  'category_slugs', 'checks', 'review_count', 'use_again_pct', 'on_time_pct', 'on_price_pct',
  'tidy_pct', 'score', 'last_review_at', 'created_at', 'verified_job_count'
], 'provider_public exposes exactly the public columns');

select columns_are('public', 'review_public', array[
  'id', 'provider_id', 'provider_slug', 'category_name', 'job_month', 'value_band', 'on_time', 'on_price',
  'quality', 'tidy', 'use_again', 'comment', 'under_check', 'reviewer_name', 'group_member', 'verified_job',
  'reply_body', 'reply_at', 'created_at', 'edited_at'
], 'review_public exposes exactly the public review columns (no reviewer id, device hash, reason or proof path)');

-- fixtures: one live (verified, whatsapp), one live bare, one paused, one invited
insert into public.providers (id, slug, business_name, phone_e164, whatsapp_e164, status, consent_at, consent_evidence, verified_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'pv-live', 'Live One', '+447700900201', '+447700900201', 'live', now(), '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-0000000000c2', 'pv-bare', 'Live Bare', '+447700900202', null, 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000000c3', 'pv-paused', 'Paused', '+447700900203', null, 'paused', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000000c4', 'pv-invited', 'Invited', '+447700900204', null, 'invited', null, null, null);

insert into public.provider_checks (provider_id, kind, reference, expires_on) values
  ('00000000-0000-0000-0000-0000000000c1', 'insurance', 'SECRET-POLICY-1', current_date - 10),
  ('00000000-0000-0000-0000-0000000000c1', 'id', 'SECRET-ID-1', null),
  ('00000000-0000-0000-0000-0000000000c1', 'dbs', 'SECRET-DBS-1', current_date + 100),
  ('00000000-0000-0000-0000-0000000000c1', 'gas_safe', 'SECRET-GAS-1', current_date + 100);

insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000000c1', id from public.categories where slug in ('plumber', 'gas-boilers');

-- gas check lapses after linking: gas-boilers must disappear from the public view
update public.provider_checks set expires_on = current_date - 1
where provider_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gas_safe';

insert into auth.users (id) select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 3) n;
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select '00000000-0000-0000-0000-0000000000c1', ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'plumber'), current_date, '250-1k', 'yes', 'yes', 5, 'yes'
from generate_series(1, 3) n;

-- review_public fixtures: Zed (group member) under check on pv-bare with a reply; a deleted reviewer; removed and
-- under_notice reviews; a review of the paused provider; an accepted proof and a removed reply on pv-live.
insert into auth.users (id) select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid from generate_series(4, 7) n;
insert into public.profiles (user_id, display_name, group_member_at, deleted_at) values
  ('00000000-0000-0000-0000-000000000204', 'Zed Z.', now(), null),
  ('00000000-0000-0000-0000-000000000205', null, null, now());
insert into public.provider_categories (provider_id, category_id)
select p, id from public.categories, (values ('00000000-0000-0000-0000-0000000000c2'::uuid), ('00000000-0000-0000-0000-0000000000c3'::uuid)) v(p)
where slug = 'caterer';
insert into public.reviews (id, provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again, status, removal_reason, comment)
select v.id, v.prov, v.usr, (select id from public.categories where slug = 'caterer'), current_date, '<250', 'yes', 'yes', 4, 'yes',
  v.st::public.review_status, v.reason, 'Lovely buffet'
from (values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, '00000000-0000-0000-0000-0000000000c2'::uuid, '00000000-0000-0000-0000-000000000204'::uuid, 'under_check', null),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000205', 'published', null),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000206', 'removed', 'Fake'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000207', 'under_notice', null),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000204', 'published', null)
) v(id, prov, usr, st, reason);
insert into public.review_responses (review_id, provider_id, author_id, body, status, removal_reason) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000201', 'Thanks Zed', 'published', null),
  ((select id from public.reviews where reviewer_id = '00000000-0000-0000-0000-000000000201'), '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-000000000202', 'Rude reply', 'removed', 'Abusive');
insert into public.review_proofs (review_id, storage_path, mime_type, outcome) values
  ((select id from public.reviews where reviewer_id = '00000000-0000-0000-0000-000000000201'), 'proofs/pv-1.jpg', 'image/jpeg', 'accepted');

set local role anon;

select is((select count(*)::int from public.review_public where provider_slug = 'pv-bare'), 1,
  'review_public hides removed, under_notice and deleted reviewers'' reviews');
select is((select under_check from public.review_public where provider_slug = 'pv-bare'), true, 'an under-check review shows, labelled');
select is((select reviewer_name || '/' || group_member from public.review_public where provider_slug = 'pv-bare'), 'Zed Z./true',
  'reviewer name and group membership');
select is((select reply_body from public.review_public where provider_slug = 'pv-bare'), 'Thanks Zed', 'a published reply shows');
select is((select count(*)::int from public.review_public where provider_slug = 'pv-paused'), 0, 'reviews of a paused provider are hidden');
select is((select count(*)::int from public.review_public where provider_slug = 'pv-live'), 3, 'pv-live reviews show');
select is((select reviewer_name from public.review_public where provider_slug = 'pv-live' limit 1), 'Bolton resident',
  'a reviewer without a display name shows as Bolton resident');
select is((select verified_job::text || '/' || coalesce(reply_body, 'none') from public.review_public
           where id = (select id from public.review_public where provider_slug = 'pv-live' and verified_job)),
  'true/none', 'an accepted proof makes a Verified job; a removed reply never shows');
select is((select verified_job_count from public.provider_public where slug = 'pv-live'), 1, 'provider_public counts verified jobs');
select throws_ok($$select * from public.review_proofs$$, '42501', null, 'anon cannot read review_proofs');
select throws_ok($$select * from public.review_responses$$, '42501', null, 'anon cannot read review_responses');

select is((select count(*)::int from public.provider_public where slug like 'pv-%'), 2, 'anon sees only live providers');
select is((select count(*)::int from public.provider_public where slug in ('pv-paused', 'pv-invited')), 0, 'paused and invited are hidden');
select is((select is_verified from public.provider_public where slug = 'pv-live'), true, 'is_verified true when verified_at set');
select is((select is_verified from public.provider_public where slug = 'pv-bare'), false, 'is_verified false otherwise');
select is((select has_whatsapp from public.provider_public where slug = 'pv-live'), true, 'has_whatsapp true');
select is((select has_whatsapp from public.provider_public where slug = 'pv-bare'), false, 'has_whatsapp false');
select is((select category_slugs from public.provider_public where slug = 'pv-live'), array['plumber'], 'lapsed gas-boilers category is hidden');
select is((select jsonb_array_length(checks) from public.provider_public where slug = 'pv-live'), 2, 'expired checks excluded (insurance and gas_safe)');
select is((select checks::text like '%SECRET%' or checks::text like '%reference%' or checks::text like '%document_path%' from public.provider_public where slug = 'pv-live'), false, 'checks never contain reference or document_path');
select is((select checks from public.provider_public where slug = 'pv-bare'), '[]'::jsonb, 'checks is [] when none');
select is((select review_count from public.provider_public where slug = 'pv-live'), 3, 'stats flow through the view');

select throws_ok($$select phone_e164 from public.providers$$, '42501', null, 'anon cannot read providers.phone_e164');
select throws_ok($$select * from public.provider_checks$$, '42501', null, 'anon cannot read provider_checks');
select throws_ok($$insert into public.providers (slug, business_name, phone_e164) values ('x', 'x', '+447700900999')$$, '42501', null, 'anon cannot insert providers');
select throws_ok($$select * from public.provider_stats('00000000-0000-0000-0000-0000000000c1')$$, '42501', null, 'anon cannot execute provider_stats');

reset role;

set local role service_role;
select lives_ok($$select slug from public.provider_public$$, 'service_role can select from provider_public');
reset role;

select * from finish();
rollback;
