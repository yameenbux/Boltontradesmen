-- More trades requested by the owner: estate agents (Moving & waste, where people moving house look), accountants (a
-- new Business & finance group) and travel agents (the Transport group, renamed Travel & transport). Each comes with
-- the check that matters: estate agents must belong to a redress scheme (Consumers, Estate Agents and Redress Act
-- 2007), anyone can call themselves an accountant, and flights and package holidays should be ATOL protected.
-- Idempotent: safe to run again.
insert into public.category_groups (name, slug, sort, asks_tidy) values ('Business & finance', 'business-finance', 8, false)
on conflict (slug) do nothing;
update public.category_groups set name = 'Travel & transport' where slug = 'transport';

insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, 'none'::public.category_requirement, v.note
from (values
  ('moving-waste', 'estate-agents', 'Estate agents', 'Estate agents must belong to a government-approved redress scheme (The Property Ombudsman or the Property Redress Scheme). Ask which one before you sign.'),
  ('business-finance', 'accountants', 'Accountants', 'Anyone can call themselves an accountant. Look for membership of ICAEW, ACCA, CIMA or AAT.'),
  ('transport', 'travel-agents', 'Travel agents', 'For flights and package holidays (Umrah and Hajj packages included), check the booking is ATOL protected. ABTA membership is a good sign too.')
) as v(grp, slug, name, note)
join public.category_groups g on g.slug = v.grp
on conflict (slug) do nothing;
