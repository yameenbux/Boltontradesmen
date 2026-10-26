-- Wedding vendors, requested by the owner: the people who do stages, canapés and dessert tables, and who hire things
-- out for functions. The group is renamed "Weddings & events", its trades say what they cover (Catering & canapés,
-- Cakes & desserts, Stages & decor), each with a tip for customers, and there's a new trade for hire firms
-- (marquees, furniture, dance floors, photo booths). Slugs stay the same, so links and listings don't change.
-- Idempotent: safe to run again.
update public.category_groups set name = 'Weddings & events' where slug = 'events-occasions';
update public.categories set name = 'Catering & canapés', guidance_note = 'Ask for their food hygiene rating (it''s on the Food Standards Agency website) and tell them about any allergies. Get the menu, numbers and price per head in writing.' where slug = 'caterer';
update public.categories set name = 'Cakes & desserts', guidance_note = 'Ask for their food hygiene rating (it''s on the Food Standards Agency website) and tell them about any allergies. Agree the design, delivery time and deposit in writing.' where slug = 'cakes';
update public.categories set name = 'Stages & decor', guidance_note = 'Agree in writing what''s included, when they set up and clear away, and the deposit. Check the venue allows outside decorators.' where slug = 'decor';
insert into public.categories (group_id, slug, name, requirement, guidance_note)
select g.id, 'event-hire', 'Event hire', 'none'::public.category_requirement, 'Agree in writing what''s included, the delivery and collection times, the deposit, and who pays for any damage. Check the venue allows it.'
from public.category_groups g where g.slug = 'events-occasions'
on conflict (slug) do nothing;
