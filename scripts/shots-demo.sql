-- Sample listings for the showcase screenshots (scripts/shots.mjs), loaded on top of supabase/tests/fixtures/e2e.sql.
-- Local databases only. Every business and person here is made up; phone numbers are in Ofcom's drama range (07700 900xxx).

insert into auth.users (id)
select ('00000000-0000-0000-0000-0000000d05' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 12) n
on conflict (id) do nothing;

create temporary table demo (
  n int, slug text, business text, contact text, areas text[], bio text, category text,
  reviews int, quality int[], use_again text[], checks text[]
) on commit drop;

insert into demo values
  (1, 'demo-halliwell-plumbing', 'Halliwell Plumbing & Heating', 'Danny Hart', '{BL1,BL3,BL5}',
     'Leaks, boilers, radiators and full bathrooms. Clean, tidy, and I turn up when I say I will.', 'plumber',
     9, '{5,5,4,5,5,4,5,5,4}', '{yes,yes,yes,yes,yes,maybe,yes,yes,yes}', '{id,insurance}'),
  (2, 'demo-smithills-plumbing', 'Smithills Plumbing', 'Kev Moss', '{BL1,BL6,BL7}', null, 'plumber',
     5, '{4,5,4,4,5}', '{yes,yes,maybe,yes,yes}', '{id}'),
  (3, 'demo-spark-right', 'Spark Right Electrical', 'Imran Patel', '{BL1,BL2,BL3,BL4}',
     'Rewires, fuse boards, EV chargers and fault finding. NICEIC registered.', 'electrician',
     7, '{5,5,5,4,5,5,5}', '{yes,yes,yes,yes,yes,yes,yes}', '{id,insurance,niceic_napit}'),
  (4, 'demo-crisp-clean', 'Crisp Clean Bolton', 'Jo Taylor', '{BL1,BL2,BL3}', 'Regular cleans, end of tenancy and one-off deep cleans.', 'cleaner',
     6, '{5,4,5,5,4,5}', '{yes,yes,yes,yes,maybe,yes}', '{id,dbs}'),
  (5, 'demo-little-bakes', 'Little Bakes by Saira', 'Saira K', '{BL1,BL3,BL4}', 'Birthday cakes, cupcakes and dessert tables. Five-star food hygiene rating.', 'cakes',
     8, '{5,5,5,5,4,5,5,5}', '{yes,yes,yes,yes,yes,yes,yes,yes}', '{food_hygiene}'),
  (6, 'demo-bounce-about', 'Bounce About Bolton', 'Lee Grundy', '{BL1,BL2,BL3,BL4,BL5,BL6,BL7}', null, 'bouncy-castles',
     4, '{5,4,5,5}', '{yes,yes,yes,yes}', '{insurance,pipa}'),
  (7, 'demo-green-thumb', 'Green Thumb Gardens', 'Ste Barlow', '{BL5,BL6}', null, 'gardener',
     3, '{4,5,4}', '{yes,yes,maybe}', '{}'),
  (8, 'demo-two-lads-van', 'Two Lads & a Van', 'Tom Ashworth', '{BL1,BL2,BL3,BL4,BL5}', null, 'man-and-van',
     2, '{5,5}', '{yes,yes}', '{}'),
  (9, 'demo-mamas-kitchen', 'Mama''s Kitchen Catering', 'Ayesha R', '{BL1,BL3}', null, 'caterer',
     5, '{5,5,4,5,5}', '{yes,yes,yes,yes,yes}', '{food_hygiene}'),
  (10, 'demo-tonge-joinery', 'Tonge Moor Joinery', 'Phil Crook', '{BL2,BL3}', null, 'joiner',
     0, '{}', '{}', '{}');

insert into public.providers (id, slug, business_name, contact_name, phone_e164, whatsapp_e164, areas, bio, status, consent_at, consent_evidence, verified_at)
select ('00000000-0000-0000-0000-0000000d01' || lpad(d.n::text, 2, '0'))::uuid, d.slug, d.business, d.contact,
  '+447700900' || (400 + d.n)::text, '+447700900' || (400 + d.n)::text, d.areas, d.bio, 'live', now(), '{"source":"shots-demo"}'::jsonb,
  case when cardinality(d.checks) > 0 then now() end
from demo d;

insert into public.provider_categories (provider_id, category_id)
select ('00000000-0000-0000-0000-0000000d01' || lpad(d.n::text, 2, '0'))::uuid, c.id
from demo d join public.categories c on c.slug = d.category;

insert into public.provider_checks (provider_id, kind, reference, expires_on, checked_at)
select ('00000000-0000-0000-0000-0000000d01' || lpad(d.n::text, 2, '0'))::uuid, k::public.check_kind, 'DEMO', null, now() - interval '9 days'
from demo d cross join unnest(d.checks) k;

insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select ('00000000-0000-0000-0000-0000000d01' || lpad(d.n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000d05' || lpad(i::text, 2, '0'))::uuid,
  c.id, (date_trunc('month', current_date) - make_interval(months => i))::date, '250-1k',
  case when i % 5 = 0 then 'late_informed' else 'yes' end::public.on_time_answer,
  case when i % 4 = 0 then 'slightly_over_explained' else 'yes' end::public.on_price_answer,
  d.quality[i], d.use_again[i]::public.use_again_answer
from demo d join public.categories c on c.slug = d.category
cross join lateral generate_series(1, d.reviews) i;

-- An invited (not yet live) listing, for the consent page screenshot.
insert into public.providers (id, slug, business_name, contact_name, phone_e164, areas, consent_token)
values ('00000000-0000-0000-0000-0000000d0199', 'demo-invited-tiling', 'Deane Tiling', 'Gaz Deane', '+447700900499', '{BL3,BL4}',
  '00000000-0000-0000-0000-0000000dc0de');
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000d0199', id from public.categories where slug = 'tiler';

-- Reviewer names (only "First I." is ever stored), a few comments, a Group member or two, one accepted proof and one
-- reply, so the profile screenshots show the reviews section as residents see it.
insert into public.profiles (user_id, role, display_name, postcode_district, group_member_at)
select ('00000000-0000-0000-0000-0000000d05' || lpad(n::text, 2, '0'))::uuid, 'resident', name, 'BL3',
  case when n in (1, 3, 4, 7) then now() end
from (values (1, 'Sarah K.'), (2, 'Mo A.'), (3, 'Claire W.'), (4, 'Dave H.'), (5, 'Priya S.'), (6, 'Gary T.'),
             (7, 'Lou B.'), (8, 'Imran D.'), (9, 'Beth C.'), (10, 'Jas P.'), (11, 'Rob F.'), (12, 'Nina L.')) v(n, name)
on conflict (user_id) do update set display_name = excluded.display_name, group_member_at = excluded.group_member_at;

update public.reviews r set
  tidy = true,
  comment = case r.reviewer_id
    when '00000000-0000-0000-0000-0000000d0501' then 'Boiler died on a Sunday. Danny came out the same afternoon, explained everything and charged what he said.'
    when '00000000-0000-0000-0000-0000000d0502' then 'New radiator in the back bedroom. Tidy, polite and quick.'
    when '00000000-0000-0000-0000-0000000d0503' then 'Full bathroom refit. Took a day longer than planned but he kept us posted. Lovely finish.'
    when '00000000-0000-0000-0000-0000000d0505' then 'Fixed a leak under the sink in twenty minutes.'
  end
where r.provider_id = '00000000-0000-0000-0000-0000000d0101';

insert into public.review_proofs (review_id, storage_path, mime_type, outcome, checked_at)
select r.id, r.id::text || '/demo.jpg', 'image/jpeg', 'accepted', now()
from public.reviews r
where r.provider_id = '00000000-0000-0000-0000-0000000d0101' and r.reviewer_id = '00000000-0000-0000-0000-0000000d0501';

insert into public.review_responses (review_id, provider_id, author_id, body)
select r.id, r.provider_id, '00000000-0000-0000-0000-0000000d0512', 'Thanks Claire. Sorry about the extra day, the tiles came late. Enjoy the new bathroom!'
from public.reviews r
where r.provider_id = '00000000-0000-0000-0000-0000000d0101' and r.reviewer_id = '00000000-0000-0000-0000-0000000d0503';
