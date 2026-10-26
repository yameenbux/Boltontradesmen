-- Personal trainers, requested by the owner. The trade already existed as "Fitness", which a personal trainer looking
-- down the list could miss: renamed so they find it, with a tip for customers.
-- Idempotent: safe to run again.
update public.categories
set name = 'Personal trainers & fitness',
    guidance_note = 'Ask about their qualification (a Level 3 personal training certificate is the usual standard) and their insurance, and tell them about any injuries or health conditions before the first session.'
where slug = 'fitness';
