-- The founding offer on the For traders page, requested by the owner: the first 20 traders get Pro free until 31
-- January 2027, as a Stripe trial that becomes paid Pro unless they cancel (lib/founding.ts). The page shows how many
-- places are left, so the count must be real:
-- * public.founding_places_taken(): listings (not removed) on a Stripe trial now (the founding offer is our only
--   trial), or holding a founding grant from the admin (000035) that the admin hasn't ended. A trial cancelled before
--   it ends, or a grant the admin ends, frees its place; a grant that simply runs out keeps it. A number only: no
--   names, no listings. Server only (the page reads it with the service role), like every function since 000038.
-- Re-runnable.

create or replace function public.founding_places_taken() returns int
language sql stable security definer set search_path = ''
as $$
  select count(distinct p.id)::int
  from public.providers p
  where p.status <> 'removed'
    and (exists (select 1 from public.pro_grants g where g.provider_id = p.id and g.revoked_at is null)
         or exists (select 1 from public.subscriptions s where s.provider_id = p.id and s.status = 'trialing'));
$$;
revoke execute on function public.founding_places_taken() from public;
revoke execute on function public.founding_places_taken() from anon, authenticated;
grant execute on function public.founding_places_taken() to service_role;
