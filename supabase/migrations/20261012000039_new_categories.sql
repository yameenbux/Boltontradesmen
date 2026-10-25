-- New trades requested by the owner before launch (EV chargers & solar, carpets, gutter cleaning, kitchen fitters,
-- fitted bedrooms, window cleaners, bathroom fitters, driveways), and two renames so
-- the names say what the categories already cover. Slugs (and so /c/... addresses and listings) stay the same.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, 'none'::public.category_requirement, v.note
from (values
  ('ev-solar', 'EV chargers & solar', 'For solar panels, ask if the installer is MCS certified: it''s needed to be paid for the power you export. EV chargers should be fitted by a registered electrician (NICEIC or NAPIT).'),
  ('carpets', 'Carpets', null),
  ('gutter-cleaning', 'Gutter cleaning', null),
  ('kitchen-fitter', 'Kitchen fitter', null),
  ('bedrooms-wardrobes', 'Fitted bedrooms & wardrobes', null),
  ('window-cleaner', 'Window cleaner', null),
  ('bathroom-fitter', 'Bathroom fitter', null),
  ('driveways-paving', 'Driveways & paving', null)
) as v(slug, name, note)
join public.category_groups g on g.slug = 'home-trades'
on conflict (slug) do nothing;

update public.categories set name = 'Cleaning services' where slug = 'cleaner';
update public.categories set name = 'Catering services' where slug = 'caterer';
update public.categories set name = 'Car valeting' where slug = 'valeting';
-- Fitting and repairing windows are one trade in practice: one category, now with the home trades.
update public.categories
set name = 'Windows, doors & glazing', group_id = (select id from public.category_groups where slug = 'home-trades')
where slug = 'window-door-repair';
