-- Building surveyors, requested by the owner: house surveys before buying, party wall awards, and defect reports for
-- extensions. Home & trades, next to Builders, with the check that matters (RICS) and what to agree in writing.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, 'building-surveyors', 'Building surveyors', 'none'::public.category_requirement,
  'Ask if they''re RICS registered (you can check on the RICS website). Agree in writing which survey you''re getting (a Level 2 or Level 3 survey, a party wall award or a defects report), the fee and when you''ll have the report.'
from public.category_groups g where g.slug = 'home-trades'
on conflict (slug) do nothing;
