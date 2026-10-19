-- One listing per phone number. Two listings for the same trader split their reviews and show them twice in a
-- trade, so the database now refuses a second listing (new or edited) with a phone number that an existing listing
-- already has, unless that listing is removed. (A withdrawn trader's listing is removed; the admin brings them back
-- with Reinvite, which keeps their reviews. The admin form also refuses a new listing for a removed listing's
-- number and points to Reinvite instead; the database only guards listings that aren't removed.)
--
-- Stops (changing nothing) if duplicates already exist, naming them: remove the extra listing first.
do $dupes$
declare
  v_list text;
begin
  select string_agg(format('%s (%s)', phone_e164, slugs), '; ')
  into v_list
  from (
    select phone_e164, string_agg(slug, ', ' order by created_at) as slugs
    from public.providers
    where status <> 'removed'
    group by phone_e164
    having count(*) > 1
  ) d;
  if v_list is not null then
    raise exception 'Two listings share a phone number: %. Set the extra listing to Removed in /admin, then run this again.', v_list;
  end if;
end
$dupes$;

create unique index if not exists providers_one_listing_per_phone
  on public.providers (phone_e164)
  where status <> 'removed';
