-- Trades the outreach list and common Bolton jobs showed were missing, agreed with the owner: fencing, decking and
-- landscaping; damp proofing and insulation; tree surgeons. Man & van also covers full house removals now (renamed,
-- same slug, so links and listings don't change). Each with a tip for customers.
-- Idempotent: safe to run again.
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, v.slug, v.name, 'none'::public.category_requirement, v.note
from public.category_groups g
cross join (values
  ('fencing-landscaping', 'Fencing, decking & landscaping', 'Agree in writing what''s included (posts, panels, concrete, taking the old fence away), the price and the start date. For a boundary fence, talk to your neighbour first.'),
  ('damp-insulation', 'Damp proofing & insulation', 'Ask what''s causing the damp before agreeing to treatment: a lot of damp is condensation or a leak, not rising damp. Get the work, the price and any guarantee in writing.'),
  ('tree-surgeons', 'Tree surgeons', 'Ask for their public liability insurance and their tree work qualifications (NPTC certificates). If the tree has a Tree Preservation Order or is in a conservation area, you need the council''s permission first.')
) as v(slug, name, note)
where g.slug = 'home-trades'
on conflict (slug) do nothing;
update public.categories set name = 'Man & van, removals', guidance_note = 'For a full house move, ask if they have goods in transit insurance, and agree the price, the date and what''s included (packing, dismantling furniture) in writing.' where slug = 'man-and-van';
