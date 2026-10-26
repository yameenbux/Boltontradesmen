-- Seed data: category groups, categories and settings.

insert into public.category_groups (name, slug, sort, asks_tidy) values
  ('Home & trades', 'home-trades', 1, true),
  ('Repairs & appliances', 'repairs-appliances', 2, false),
  ('Moving & waste', 'moving-waste', 3, true),
  ('Weddings & events', 'events-occasions', 4, false),
  ('Personal & lessons', 'personal-lessons', 5, false),
  ('Vehicles', 'vehicles', 6, false),
  ('Business & finance', 'business-finance', 8, false)
on conflict (slug) do nothing;

insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, v.requirement::public.category_requirement, v.guidance_note
from (values
  ('home-trades', 'plumber', 'Plumber', 'none', null),
  ('home-trades', 'electrician', 'Electrician', 'none', 'For rewires and new circuits, look for an NICEIC/NAPIT tick or ask about building control sign-off.'),
  ('home-trades', 'gas-boilers', 'Gas & boilers', 'gas_safe', null),
  ('home-trades', 'joiner', 'Joiner', 'none', null),
  ('home-trades', 'plasterer', 'Plasterer', 'none', null),
  ('home-trades', 'venetian-plaster', 'Venetian plaster', 'none', null),
  ('home-trades', 'painter-decorator', 'Painter & decorator', 'none', null),
  ('home-trades', 'roofer', 'Roofer', 'none', null),
  ('home-trades', 'handyman', 'Handyman', 'none', null),
  ('home-trades', 'tiler', 'Tiler', 'none', null),
  ('home-trades', 'locksmith', 'Locksmith', 'none', null),
  ('home-trades', 'gardener', 'Gardener', 'none', null),
  ('home-trades', 'cleaner', 'Cleaning services', 'none', null),
  ('home-trades', 'bricklayer', 'Bricklayer', 'none', null),
  ('home-trades', 'air-conditioning', 'Air conditioning', 'none', 'Air conditioning must be installed by an F-gas certified engineer: ask to see their certificate. Ask where the outdoor unit will go and how loud it is, and get the unit model, the price and the warranty in writing.'),
  ('home-trades', 'builders', 'Builders & extensions', 'none', 'For extensions, conversions and structural work, ask whether it needs planning permission or building regulations approval, and who will apply. Get the quote and the timings in writing, and agree stage payments rather than paying a lot up front.'),
  ('home-trades', 'pest-control', 'Pest control', 'none', null),
  ('home-trades', 'ev-solar', 'EV chargers & solar', 'none', 'For solar panels, ask if the installer is MCS certified: it''s needed to be paid for the power you export. EV chargers should be fitted by a registered electrician (NICEIC or NAPIT).'),
  ('home-trades', 'carpets', 'Carpets', 'none', null),
  ('home-trades', 'gutter-cleaning', 'Gutter cleaning', 'none', null),
  ('home-trades', 'kitchen-fitter', 'Kitchen fitter', 'none', null),
  ('home-trades', 'cctv-security', 'CCTV & security', 'none', 'For alarms, NSI or SSAIB approval is a good sign. If cameras will see past your boundary (the street or a neighbour''s home), the footage comes under data protection law: ask the installer where to point them.'),
  ('home-trades', 'bedrooms-wardrobes', 'Fitted bedrooms & wardrobes', 'none', null),
  ('home-trades', 'window-cleaner', 'Window cleaner', 'none', null),
  ('home-trades', 'bathroom-fitter', 'Bathroom fitter', 'none', null),
  ('home-trades', 'driveways-paving', 'Driveways & paving', 'none', null),
  ('home-trades', 'window-door-repair', 'Windows, doors & glazing', 'none', null),
  ('repairs-appliances', 'appliance-repair', 'Appliance repair', 'none', null),
  ('repairs-appliances', 'heating-repair', 'Heating repair', 'none', null),
  ('repairs-appliances', 'phone-computer-repair', 'Phone & computer repair', 'none', null),
  ('moving-waste', 'rubbish-removal', 'Rubbish removal', 'none', null),
  ('moving-waste', 'man-and-van', 'Man & van', 'none', null),
  ('moving-waste', 'skip-hire', 'Skip hire', 'none', null),
  ('moving-waste', 'house-clearance', 'House clearance', 'none', null),
  ('moving-waste', 'estate-agents', 'Estate agents', 'none', 'Estate agents must belong to a government-approved redress scheme (The Property Ombudsman or the Property Redress Scheme). Ask which one before you sign.'),
  ('business-finance', 'accountants', 'Accountants', 'none', 'Anyone can call themselves an accountant. Look for membership of ICAEW, ACCA, CIMA or AAT.'),
  ('events-occasions', 'caterer', 'Catering & canapés', 'none', 'Ask for their food hygiene rating (it''s on the Food Standards Agency website) and tell them about any allergies. Get the menu, numbers and price per head in writing.'),
  ('events-occasions', 'bouncy-castles', 'Bouncy castles', 'none', null),
  ('events-occasions', 'dj', 'DJ', 'none', null),
  ('events-occasions', 'cakes', 'Cakes & desserts', 'none', 'Ask for their food hygiene rating (it''s on the Food Standards Agency website) and tell them about any allergies. Agree the design, delivery time and deposit in writing.'),
  ('events-occasions', 'decor', 'Stages & decor', 'none', 'Agree in writing what''s included, when they set up and clear away, and the deposit. Check the venue allows outside decorators.'),
  ('events-occasions', 'event-hire', 'Event hire', 'none', 'Agree in writing what''s included, the delivery and collection times, the deposit, and who pays for any damage. Check the venue allows it.'),
  ('events-occasions', 'photographer', 'Photographer', 'none', null),
  ('events-occasions', 'entertainer', 'Entertainer', 'none', null),
  ('events-occasions', 'florist', 'Florist', 'none', null),
  ('events-occasions', 'venues', 'Wedding & event venues', 'none', null),
  ('personal-lessons', 'mobile-hair-beauty', 'Mobile hair & beauty', 'none', null),
  ('personal-lessons', 'tutors', 'Tutors', 'none', null),
  ('personal-lessons', 'driving-instructors', 'Driving instructors', 'dvsa_adi', null),
  ('personal-lessons', 'fitness', 'Personal trainers & fitness', 'none', 'Ask about their qualification (a Level 3 personal training certificate is the usual standard) and their insurance, and tell them about any injuries or health conditions before the first session.'),
  ('personal-lessons', 'music-lessons', 'Music lessons', 'none', null),
  ('personal-lessons', 'dog-walking-grooming', 'Dog walking & grooming', 'none', null),
  ('vehicles', 'mechanic', 'Mechanic & car servicing', 'none', null),
  ('vehicles', 'valeting', 'Car valeting', 'none', null),
  ('vehicles', 'mot', 'MOT test', 'none', 'MOTs can only be done at a DVSA-approved test centre: look for the blue sign with three white triangles.'),
  ('vehicles', 'mobile-tyre-fitting', 'Mobile tyre fitting', 'none', null),
  ('vehicles', 'vehicle-recovery', 'Vehicle recovery', 'none', 'Agree the price before they set off (recovery is often charged by distance), and ask if they have goods-in-transit insurance to cover your vehicle while it''s on their truck.'),
  ('vehicles', 'window-tinting', 'Window tinting', 'none', 'The windscreen must let through at least 75% of light and the front side windows at least 70%. Darker tints there can mean a fine or a failed MOT; rear windows have no limit.')
) as v(group_slug, slug, name, requirement, guidance_note)
join public.category_groups g on g.slug = v.group_slug
on conflict (slug) do nothing;

insert into public.settings (key, value) values
  ('enquiry_threshold', '5'::jsonb),
  ('group_code', '"BOLTON"'::jsonb);
