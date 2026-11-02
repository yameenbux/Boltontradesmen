-- The founding offer on the For traders page, requested by the owner: the first 20 traders get Pro free (a founding
-- grant from the admin, as 000035). The page shows how many places are left, so the count must be real:
-- * public.founding_places_taken(): listings (not removed) that hold a founding grant the admin hasn't ended, live or
--   run out. A grant the admin ends frees its place; one that simply runs out keeps it. A number only: no names, no
--   listings. Server only (the page reads it with the service role), like every function since 000038.
-- Re-runnable.

create or replace function public.founding_places_taken() returns int
language sql stable security definer set search_path = ''
as $$
  select count(distinct g.provider_id)::int
  from public.pro_grants g
  join public.providers p on p.id = g.provider_id and p.status <> 'removed'
  where g.revoked_at is null;
$$;
revoke execute on function public.founding_places_taken() from public;
revoke execute on function public.founding_places_taken() from anon, authenticated;
grant execute on function public.founding_places_taken() to service_role;
