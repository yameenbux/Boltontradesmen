-- Builders, requested by the owner: one of the biggest groups of Bolton trade companies (extensions, renovations,
-- loft and garage conversions) had nowhere to go. Home & trades, with the check that matters: whether the work needs
-- planning permission or building regulations approval, and who applies.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, 'builders', 'Builders & extensions', 'none'::public.category_requirement,
  'For extensions, conversions and structural work, ask whether it needs planning permission or building regulations approval, and who will apply. Get the quote and the timings in writing, and agree stage payments rather than paying a lot up front.'
from public.category_groups g where g.slug = 'home-trades'
on conflict (slug) do nothing;
