-- Air conditioning, requested by the owner. Home & trades, with the check that matters: by law only F-gas certified
-- engineers can install it.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, 'air-conditioning', 'Air conditioning', 'none'::public.category_requirement,
  'Air conditioning must be installed by an F-gas certified engineer: ask to see their certificate. Ask where the outdoor unit will go and how loud it is, and get the unit model, the price and the warranty in writing.'
from public.category_groups g where g.slug = 'home-trades'
on conflict (slug) do nothing;
