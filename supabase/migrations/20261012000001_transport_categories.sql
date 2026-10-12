-- Transport group: taxis, minibuses and airport runs (requested by the owner on launch day).
-- Already applied by hand to the hosted project; on conflict keeps it idempotent there.
insert into public.category_groups (name, slug, sort, asks_tidy) values ('Transport', 'transport', 7, false)
on conflict (slug) do nothing;

insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, 'none'::public.category_requirement, v.note
from (values
  ('taxi-private-hire', 'Taxi & private hire', 'Taxis and private hire drivers must be licensed by a council. Ask to see their badge, and only book through a licensed operator.'),
  ('minibus-hire', 'Minibus hire', 'Minibuses with a driver for 9+ passengers need an operator licence. Ask before you book.'),
  ('airport-transfers', 'Airport transfers', 'Airport runs are private hire work, so the driver should hold a council private hire licence.')
) as v(slug, name, note)
join public.category_groups g on g.slug = 'transport'
on conflict (slug) do nothing;
