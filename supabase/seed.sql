-- Seed data: category groups, categories and settings.

insert into public.category_groups (name, slug, sort, asks_tidy) values
  ('Home & trades', 'home-trades', 1, true),
  ('Repairs & appliances', 'repairs-appliances', 2, false),
  ('Moving & waste', 'moving-waste', 3, true),
  ('Events & occasions', 'events-occasions', 4, false),
  ('Personal & lessons', 'personal-lessons', 5, false),
  ('Vehicles', 'vehicles', 6, false);

insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, v.requirement::public.category_requirement, v.guidance_note
from (values
  ('home-trades', 'plumber', 'Plumber', 'none', null),
  ('home-trades', 'electrician', 'Electrician', 'none', 'For rewires and new circuits, look for an NICEIC/NAPIT tick or ask about building control sign-off.'),
  ('home-trades', 'gas-boilers', 'Gas & boilers', 'gas_safe', null),
  ('home-trades', 'joiner', 'Joiner', 'none', null),
  ('home-trades', 'plasterer', 'Plasterer', 'none', null),
  ('home-trades', 'painter-decorator', 'Painter & decorator', 'none', null),
  ('home-trades', 'roofer', 'Roofer', 'none', null),
  ('home-trades', 'handyman', 'Handyman', 'none', null),
  ('home-trades', 'tiler', 'Tiler', 'none', null),
  ('home-trades', 'locksmith', 'Locksmith', 'none', null),
  ('home-trades', 'gardener', 'Gardener', 'none', null),
  ('home-trades', 'cleaner', 'Cleaning services', 'none', null),
  ('home-trades', 'bricklayer', 'Bricklayer', 'none', null),
  ('home-trades', 'pest-control', 'Pest control', 'none', null),
  ('home-trades', 'ev-solar', 'EV chargers & solar', 'none', 'For solar panels, ask if the installer is MCS certified: it''s needed to be paid for the power you export. EV chargers should be fitted by a registered electrician (NICEIC or NAPIT).'),
  ('home-trades', 'carpets', 'Carpets', 'none', null),
  ('home-trades', 'gutter-cleaning', 'Gutter cleaning', 'none', null),
  ('home-trades', 'kitchen-fitter', 'Kitchen fitter', 'none', null),
  ('repairs-appliances', 'appliance-repair', 'Appliance repair', 'none', null),
  ('repairs-appliances', 'heating-repair', 'Heating repair', 'none', null),
  ('repairs-appliances', 'phone-computer-repair', 'Phone & computer repair', 'none', null),
  ('repairs-appliances', 'window-door-repair', 'Window & door repair', 'none', null),
  ('moving-waste', 'rubbish-removal', 'Rubbish removal', 'none', null),
  ('moving-waste', 'man-and-van', 'Man & van', 'none', null),
  ('moving-waste', 'skip-hire', 'Skip hire', 'none', null),
  ('moving-waste', 'house-clearance', 'House clearance', 'none', null),
  ('events-occasions', 'caterer', 'Catering services', 'none', null),
  ('events-occasions', 'bouncy-castles', 'Bouncy castles', 'none', null),
  ('events-occasions', 'dj', 'DJ', 'none', null),
  ('events-occasions', 'cakes', 'Cakes', 'none', null),
  ('events-occasions', 'decor', 'Decor', 'none', null),
  ('events-occasions', 'photographer', 'Photographer', 'none', null),
  ('events-occasions', 'entertainer', 'Entertainer', 'none', null),
  ('events-occasions', 'florist', 'Florist', 'none', null),
  ('personal-lessons', 'mobile-hair-beauty', 'Mobile hair & beauty', 'none', null),
  ('personal-lessons', 'tutors', 'Tutors', 'none', null),
  ('personal-lessons', 'driving-instructors', 'Driving instructors', 'dvsa_adi', null),
  ('personal-lessons', 'fitness', 'Fitness', 'none', null),
  ('personal-lessons', 'music-lessons', 'Music lessons', 'none', null),
  ('personal-lessons', 'dog-walking-grooming', 'Dog walking & grooming', 'none', null),
  ('vehicles', 'mechanic', 'Mechanic', 'none', null),
  ('vehicles', 'valeting', 'Valeting', 'none', null),
  ('vehicles', 'mot', 'MOT', 'none', null),
  ('vehicles', 'mobile-tyre-fitting', 'Mobile tyre fitting', 'none', null)
) as v(group_slug, slug, name, requirement, guidance_note)
join public.category_groups g on g.slug = v.group_slug;

insert into public.settings (key, value) values
  ('enquiry_threshold', '5'::jsonb),
  ('group_code', '"BOLTON"'::jsonb);
