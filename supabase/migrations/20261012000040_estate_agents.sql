-- Estate agents, requested by the owner. In Moving & waste, where people moving house look. Every UK estate agent must
-- belong to a government-approved redress scheme (Consumers, Estate Agents and Redress Act 2007), so the guidance says
-- to ask which. Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, 'estate-agents', 'Estate agents', 'none'::public.category_requirement,
  'Estate agents must belong to a government-approved redress scheme (The Property Ombudsman or the Property Redress Scheme). Ask which one before you sign.'
from public.category_groups g where g.slug = 'moving-waste'
on conflict (slug) do nothing;
