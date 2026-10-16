-- E2E fixture: loaded by scripts/e2e-prepare.sh (the Playwright webServer command) after `npm run db:reset`, as postgres.
-- Not named *.test.sql so pg_prove ignores it.

insert into public.providers (id, slug, business_name, contact_name, phone_e164, whatsapp_e164, areas, bio, status, consent_at, consent_evidence, verified_at) values
  ('00000000-0000-0000-0000-00000000e201', 'e2e-ace-plumbing', 'Ace Plumbing', 'Alan Ace', '+447700900301', '+447700900301',
    array['BL1','BL3','BL4'], 'Boilers, leaks and bathrooms across Bolton.', 'live', now(), '{"source":"e2e"}'::jsonb, now()),
  ('00000000-0000-0000-0000-00000000e202', 'e2e-fresh-pipes', 'Fresh Pipes', 'Fran Fresh', '+447700900302', null,
    array['BL5','BL6'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e203', 'e2e-half-way', 'Half Way Plumbing', null, '+447700900303', null,
    array['BL3'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Review targets for the sign-in specs (one per trade, so reviewers never share a trade with them): no reviews,
  -- except one under-check review of Calm Carpentry.
  ('00000000-0000-0000-0000-00000000e204', 'e2e-calm-carpentry', 'Calm Carpentry', 'Cal Calm', '+447700900304', null,
    array['BL1','BL2'], 'Doors, skirting and fitted wardrobes.', 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e205', 'e2e-neat-sparks', 'Neat Sparks', 'Nat Neat', '+447700900305', '+447700900305',
    array['BL3','BL4'], 'Sockets, lighting and fuse boards.', 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e206', 'e2e-tidy-vans', 'Tidy Vans', 'Tia Tidy', '+447700900306', null,
    array['BL1','BL5'], 'House moves and single items.', 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Two more joiners (Plan 2b, held reviews): Oak Joinery for the approval queue, Birch Joinery for a Google
  -- reviewer's published review. Joiners, so the home page's trade counts don't change.
  ('00000000-0000-0000-0000-00000000e207', 'e2e-oak-joinery', 'Oak Joinery', 'Owen Oak', '+447700900307', null,
    array['BL1'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e208', 'e2e-birch-joinery', 'Birch Joinery', 'Bea Birch', '+447700900308', null,
    array['BL2'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Rating badges: Pine Joinery has 5 top reviews (Top rated). A joiner too, so the home page's counts don't change.
  ('00000000-0000-0000-0000-00000000e209', 'e2e-pine-joinery', 'Pine Joinery', 'Pip Pine', '+447700900309', null,
    array['BL1','BL2'], 'Staircases, doors and kitchens.', 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Review cards: linked by its trader and reviewed through /r/<slug> in review-card.spec.ts. A second man & van,
  -- so the home page's tiles don't change.
  ('00000000-0000-0000-0000-00000000e210', 'e2e-card-vans', 'Card Removals', 'Cath Card', '+447700900310', null,
    array['BL2'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Availability (availability.spec.ts), more man & van so the home page's tiles don't change: Keen is taking on
  -- work (set today), Busy Bee booked up for four weeks, Stale's "taking on work" ran out (set 20 days ago); Ready is
  -- linked and set by its trader in the spec, Swift set and cleared by the admin.
  ('00000000-0000-0000-0000-00000000e211', 'e2e-keen-vans', 'Keen Removals', 'Kit Keen', '+447700900311', null,
    array['BL3'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e212', 'e2e-busy-vans', 'Busy Bee Removals', 'Bev Busy', '+447700900312', null,
    array['BL3'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e213', 'e2e-stale-vans', 'Stale Removals', 'Stu Stale', '+447700900313', null,
    array['BL3'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e214', 'e2e-ready-vans', 'Ready Removals', 'Rae Ready', '+447700900314', null,
    array['BL4'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e215', 'e2e-swift-vans', 'Swift Removals', 'Sid Swift', '+447700900315', null,
    array['BL4'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Website badge (share.spec.ts): linked by its trader, who copies the embed code. The ampersand checks escaping.
  ('00000000-0000-0000-0000-00000000e216', 'e2e-shaw-vans', 'Shaw & Daughters Removals', 'Sam Shaw', '+447700900316', null,
    array['BL6'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Trader dashboard (trader-dashboard.spec.ts), more man & van: Dash is linked by its trader, who sees its
  -- enquiries, edits it, pauses and unpauses it; Gone is linked and withdrawn; Tally (unlinked) has the admin's stats.
  ('00000000-0000-0000-0000-00000000e217', 'e2e-dash-vans', 'Dash Removals', 'Dee Dash', '+447700900317', '+447700900317',
    array['BL2'], 'House moves across Bolton.', 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e218', 'e2e-gone-vans', 'Gone Removals', 'Gus Gone', '+447700900318', null,
    array['BL7'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e219', 'e2e-tally-vans', 'Tally Removals', 'Tam Tally', '+447700900319', '+447700900319',
    array['BL5'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Pro (pro.spec.ts), more man & van: linked by its trader, who has had 5 enquiries, takes Pro (a subscription
  -- written as the webhook would), sends their ID and a work photo; the admin approves the ID; then Pro lapses.
  ('00000000-0000-0000-0000-00000000e220', 'e2e-lift-vans', 'Lift Removals', 'Pip Lift', '+447700900320', null,
    array['BL1'], 'Careful moves, big and small.', 'live', now(), '{"source":"e2e"}'::jsonb, null),
  -- Community questions (questions.spec.ts), more man & van: Hill Top and Brook are recommended in answers (Hill Top
  -- has WhatsApp, for the question page's buttons); Helper is linked to its trader in the spec, who says "I can help".
  ('00000000-0000-0000-0000-00000000e221', 'e2e-hilltop-vans', 'Hill Top Removals', 'Hal Hill', '+447700900321', '+447700900321',
    array['BL3','BL5'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e222', 'e2e-brook-vans', 'Brook Removals', 'Bri Brook', '+447700900322', null,
    array['BL6'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e223', 'e2e-helper-vans', 'Helper Removals', 'Hel Helper', '+447700900323', null,
    array['BL7'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null);

-- Enquiries (contact_events, at a fixed time of day in Bolton so a run near midnight doesn't split them). Dash: this
-- month a call and a WhatsApp (two devices; a repeat call doesn't count), last month one call: 3 of 5. Tally: this
-- month three calls and a WhatsApp, two months ago two calls: 6, so Pro's threshold is reached.
create temp table e2e_month on commit drop as
select date_trunc('month', now() at time zone 'Europe/London') as m;
insert into public.contact_events (provider_id, type, device_hash, created_at)
select v.provider_id::uuid, v.type::public.contact_type, v.device,
  (least((select m from e2e_month) + make_interval(months => v.months) + interval '12 hours',
         date_trunc('day', now() at time zone 'Europe/London') + interval '1 hour')) at time zone 'Europe/London'
from (values
  ('00000000-0000-0000-0000-00000000e217', 'call_tap', 'e2e-dash-1', 0),
  ('00000000-0000-0000-0000-00000000e217', 'call_tap', 'e2e-dash-1', 0),
  ('00000000-0000-0000-0000-00000000e217', 'whatsapp_tap', 'e2e-dash-2', 0),
  ('00000000-0000-0000-0000-00000000e217', 'call_tap', 'e2e-dash-3', -1),
  ('00000000-0000-0000-0000-00000000e219', 'call_tap', 'e2e-tally-1', 0),
  ('00000000-0000-0000-0000-00000000e219', 'call_tap', 'e2e-tally-2', 0),
  ('00000000-0000-0000-0000-00000000e219', 'call_tap', 'e2e-tally-3', 0),
  ('00000000-0000-0000-0000-00000000e219', 'whatsapp_tap', 'e2e-tally-4', 0),
  ('00000000-0000-0000-0000-00000000e219', 'call_tap', 'e2e-tally-5', -2),
  ('00000000-0000-0000-0000-00000000e219', 'call_tap', 'e2e-tally-6', -2),
  ('00000000-0000-0000-0000-00000000e220', 'call_tap', 'e2e-lift-1', 0),
  ('00000000-0000-0000-0000-00000000e220', 'whatsapp_tap', 'e2e-lift-2', 0),
  ('00000000-0000-0000-0000-00000000e220', 'call_tap', 'e2e-lift-3', -1),
  ('00000000-0000-0000-0000-00000000e220', 'call_tap', 'e2e-lift-4', -1),
  ('00000000-0000-0000-0000-00000000e220', 'whatsapp_tap', 'e2e-lift-5', -2)
) v(provider_id, type, device, months);

update public.providers set availability = 'taking', availability_set_at = now() where slug = 'e2e-keen-vans';
update public.providers set availability = 'booked', availability_set_at = now() - interval '2 days',
  available_until = (now() at time zone 'Europe/London')::date + 28 where slug = 'e2e-busy-vans';
update public.providers set availability = 'taking', availability_set_at = now() - interval '20 days'
where slug = 'e2e-stale-vans';

insert into public.provider_categories (provider_id, category_id)
select p.id, c.id
from public.providers p cross join public.categories c
where (p.slug in ('e2e-ace-plumbing', 'e2e-fresh-pipes', 'e2e-half-way') and c.slug = 'plumber')
   or (p.slug in ('e2e-calm-carpentry', 'e2e-oak-joinery', 'e2e-birch-joinery', 'e2e-pine-joinery') and c.slug = 'joiner')
   or (p.slug = 'e2e-neat-sparks' and c.slug = 'electrician')
   or (p.slug in ('e2e-tidy-vans', 'e2e-card-vans', 'e2e-keen-vans', 'e2e-busy-vans', 'e2e-stale-vans',
                  'e2e-ready-vans', 'e2e-swift-vans', 'e2e-shaw-vans', 'e2e-dash-vans', 'e2e-gone-vans',
                  'e2e-tally-vans', 'e2e-lift-vans', 'e2e-hilltop-vans', 'e2e-brook-vans', 'e2e-helper-vans')
       and c.slug = 'man-and-van');

insert into public.provider_checks (provider_id, kind, reference, expires_on, checked_at) values
  ('00000000-0000-0000-0000-00000000e201', 'id', 'E2E-ID', null, '2026-10-03'),
  ('00000000-0000-0000-0000-00000000e201', 'insurance', 'E2E-POLICY', '2099-03-31', '2026-10-03');

insert into auth.users (id)
select ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 5) n
on conflict (id) do nothing; -- the local-stack db:reset does not clear auth.users

-- Fixture reviewers' public names ("Pat P."). Pat and Sam joined the old WhatsApp group; nothing shows it now.
insert into public.profiles (user_id, role, display_name, postcode_district, group_member_at)
select ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid, 'resident', name, 'BL3', case when member then now() end
from (values (1, 'Pat P.', true), (2, 'Jo B.', false), (3, 'Sam T.', true), (4, 'Ali R.', false), (5, 'Kim D.', false)) v(n, name, member);

-- Ace Plumbing: 4 reviews. Half Way: 2 reviews. Fresh Pipes: none.
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select '00000000-0000-0000-0000-00000000e201', ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '250-1k', 'yes', 'yes', 5, 'yes'
from generate_series(1, 4) n;

insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select '00000000-0000-0000-0000-00000000e203', ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, 'yes'
from generate_series(1, 2) n;

-- Pine Joinery: 5 published reviews, all 5 stars and "would use again", so it earns Top rated (Ace, with 4, earns none).
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again)
select '00000000-0000-0000-0000-00000000e209', ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'joiner'), date_trunc('month', current_date)::date, '250-1k', 'yes', 'yes', 5, true, 'yes'
from generate_series(1, 5) n;

-- Ace reviews: comments (no digits that look like a phone number), and one accepted proof (Pat's: "Verified job").
update public.reviews r set comment = v.comment
from (values
  (1, 'Fixed a leaking combi the same day. Explained everything and the price matched the quote.'),
  (2, 'New radiator in the back bedroom. Tidy, polite and quick.'),
  (3, 'Came out on a Sunday for a burst pipe. Would happily use again.'),
  (4, null)
) v(n, comment)
where r.provider_id = '00000000-0000-0000-0000-00000000e201'
  and r.reviewer_id = ('00000000-0000-0000-0000-00000000e3' || lpad(v.n::text, 2, '0'))::uuid;
insert into public.review_proofs (review_id, storage_path, mime_type, outcome, checked_at)
select id, 'e2e/pat-invoice.jpg', 'image/jpeg', 'accepted', now() from public.reviews
where provider_id = '00000000-0000-0000-0000-00000000e201' and reviewer_id = '00000000-0000-0000-0000-00000000e301';

-- Calm Carpentry: one review under check (an open burst_48h flag), for the moderation spec.
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, comment, status, device_hash)
values ('00000000-0000-0000-0000-00000000e204', '00000000-0000-0000-0000-00000000e305', (select id from public.categories where slug = 'joiner'),
  date_trunc('month', current_date)::date, '250-1k', 'yes', 'yes', 5, true, 'yes', 'Hung three doors, all perfect.', 'under_check', 'e2e-kim');
insert into public.flags (target_type, target_id, source, rule)
select 'review', id, 'auto', 'burst_48h' from public.reviews where provider_id = '00000000-0000-0000-0000-00000000e204';

-- Community questions: one asked 15 days ago, so it's closed (Ali asked, Kim recommended Hill Top Removals).
insert into public.questions (id, asker_id, category_id, district, body, status, created_at, published_at)
values ('00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000e304',
  (select id from public.categories where slug = 'man-and-van'), 'BL5',
  'Anyone know a man and van for a piano? Closed fixture question.', 'published',
  now() - interval '15 days', now() - interval '15 days');
insert into public.question_answers (question_id, author_id, kind, provider_id, note, created_at)
values ('00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000e305', 'recommend',
  '00000000-0000-0000-0000-00000000e221', 'Moved ours without a scratch.', now() - interval '14 days');

-- Every E2E sign-in comes from 127.0.0.1, so raise the per-IP (and per-number) OTP limits.
update public.settings set value = '{"number_15m":50,"number_24h":200,"ip_1h":1000,"ip_24h":5000}'::jsonb where key = 'otp_limits';
-- The same for the wrong-code limiter (final review 2, I4).
update public.settings set value = '{"number_15m":50,"ip_1h":1000}'::jsonb where key = 'otp_verify_limits';
-- Email codes (Plan 2b): every E2E sign-in comes from one address and connection.
update public.settings set value = '{"address_15m":50,"address_24h":200,"ip_1h":1000,"ip_24h":5000,"daily_cap":5000,"monthly_cap":50000}'::jsonb
where key = 'email_limits';
