-- Bolton Vouched: finish the admin "save provider" function.
-- Run once in Supabase -> SQL Editor (project "Bolton Vouched"). Safe to run again.
-- It replaces the interim version so that unticking a trade on a provider also removes it.
-- The `delete` inside only ever removes rows from provider_categories for the provider being saved.

create or replace function public.admin_upsert_provider(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_areas text[];
  v_cats uuid[];
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;

  v_id := nullif(p ->> 'id', '')::uuid;
  v_areas := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'areas', '[]'::jsonb))), '{}');

  if v_id is null then
    insert into public.providers (slug, business_name, contact_name, phone_e164, whatsapp_e164, areas, bio)
    values (
      private.unique_slug(p ->> 'business_name'),
      p ->> 'business_name',
      nullif(p ->> 'contact_name', ''),
      p ->> 'phone_e164',
      nullif(p ->> 'whatsapp_e164', ''),
      v_areas,
      nullif(p ->> 'bio', '')
    ) returning id into v_id;
  else
    update public.providers set
      business_name = p ->> 'business_name',
      contact_name = nullif(p ->> 'contact_name', ''),
      phone_e164 = p ->> 'phone_e164',
      whatsapp_e164 = nullif(p ->> 'whatsapp_e164', ''),
      areas = v_areas,
      bio = nullif(p ->> 'bio', '')
    where id = v_id;
    if not found then
      raise exception 'provider not found' using errcode = 'P0002';
    end if;
  end if;

  -- Replace the category set (only touch rows that change, so unchanged categories are not re-validated).
  if p ? 'category_ids' then
    v_cats := coalesce(array(select jsonb_array_elements_text(p -> 'category_ids')::uuid), '{}');
    delete from public.provider_categories
    where provider_id = v_id and category_id <> all (v_cats);
    insert into public.provider_categories (provider_id, category_id)
    select v_id, c from unnest(v_cats) c
    on conflict do nothing;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'upsert_provider', 'provider', v_id::text);
  return v_id;
end;
$$;
