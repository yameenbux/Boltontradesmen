-- Two more trades requested by the owner: Venetian plaster (Home & trades: polished and decorative plaster, a
-- specialist finish most plasterers don't offer) and vehicle recovery (Vehicles), with the check that matters: agree
-- the price before they set off, and that they're insured to carry your vehicle. Roofers and bricklayers were already
-- listed (Roofer, Bricklayer); only their search words change, in the app.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, 'none'::public.category_requirement, v.note
from (values
  ('home-trades', 'venetian-plaster', 'Venetian plaster', null),
  ('vehicles', 'vehicle-recovery', 'Vehicle recovery',
   'Agree the price before they set off (recovery is often charged by distance), and ask if they have goods-in-transit insurance to cover your vehicle while it''s on their truck.')
) as v(grp, slug, name, note)
join public.category_groups g on g.slug = v.grp
on conflict (slug) do nothing;
