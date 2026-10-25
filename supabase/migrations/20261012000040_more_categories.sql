-- More trades requested by the owner: estate agents (Moving & waste, where people moving house look), accountants (a
-- new Business & finance group), travel agents (the Transport group, renamed Travel & transport), window tinting,
-- CCTV & security, and wedding & event venues; MOT and Mechanic get clearer names. Each comes with the check that
-- matters: estate agents must belong to a redress scheme (Consumers, Estate Agents and Redress Act 2007), anyone can
-- call themselves an accountant, flights and package holidays should be ATOL protected, front window tints have legal
-- limits, MOTs need a DVSA-approved centre, and cameras that see past your boundary bring data protection duties.
-- Idempotent: safe to run again.
insert into public.category_groups (name, slug, sort, asks_tidy) values ('Business & finance', 'business-finance', 8, false)
on conflict (slug) do nothing;
update public.category_groups set name = 'Travel & transport' where slug = 'transport';

insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, 'none'::public.category_requirement, v.note
from (values
  ('moving-waste', 'estate-agents', 'Estate agents', 'Estate agents must belong to a government-approved redress scheme (The Property Ombudsman or the Property Redress Scheme). Ask which one before you sign.'),
  ('business-finance', 'accountants', 'Accountants', 'Anyone can call themselves an accountant. Look for membership of ICAEW, ACCA, CIMA or AAT.'),
  ('transport', 'travel-agents', 'Travel agents', 'For flights and package holidays (Umrah and Hajj packages included), check the booking is ATOL protected. ABTA membership is a good sign too.'),
  ('vehicles', 'window-tinting', 'Window tinting', 'The windscreen must let through at least 75% of light and the front side windows at least 70%. Darker tints there can mean a fine or a failed MOT; rear windows have no limit.'),
  ('home-trades', 'cctv-security', 'CCTV & security', 'For alarms, NSI or SSAIB approval is a good sign. If cameras will see past your boundary (the street or a neighbour''s home), the footage comes under data protection law: ask the installer where to point them.'),
  ('events-occasions', 'venues', 'Wedding & event venues', null)
) as v(grp, slug, name, note)
join public.category_groups g on g.slug = v.grp
on conflict (slug) do nothing;

update public.categories
set name = 'MOT test', guidance_note = 'MOTs can only be done at a DVSA-approved test centre: look for the blue sign with three white triangles.'
where slug = 'mot';
update public.categories set name = 'Mechanic & car servicing' where slug = 'mechanic';
