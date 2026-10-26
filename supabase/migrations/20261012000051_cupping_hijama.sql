-- Cupping and hijama, requested by the owner. Personal & lessons, with the checks that matter for a treatment that
-- breaks the skin: council skin-piercing registration, single-use equipment, and telling them about medical conditions.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, 'cupping-hijama', 'Cupping & hijama', 'none'::public.category_requirement,
  'Wet cupping (hijama) breaks the skin. Ask if they''re registered with the council for skin piercing, and check they use new single-use blades and cups for every client. Tell them about any medical conditions or blood-thinning medicines first.'
from public.category_groups g where g.slug = 'personal-lessons'
on conflict (slug) do nothing;
