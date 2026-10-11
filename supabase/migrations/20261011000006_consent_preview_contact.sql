-- Consent page redesign: the preview also returns the contact name (for the greeting and the "how you'll appear"
-- summary) and whether a WhatsApp number is on file (so the summary names the right contact buttons).
-- The phone numbers themselves are never returned. Re-runnable: the return type changes, so drop then create.

drop function if exists public.consent_preview(uuid);
create function public.consent_preview(p_token uuid)
returns table (business_name text, categories text[], areas text[], contact_name text, has_whatsapp boolean)
language sql stable security definer set search_path = ''
as $$
  select p.business_name,
         coalesce((select array_agg(c.name order by c.name) from public.provider_categories pc
                   join public.categories c on c.id = pc.category_id where pc.provider_id = p.id), '{}'::text[]),
         coalesce(p.areas, '{}'::text[]),
         p.contact_name,
         (p.whatsapp_e164 is not null)
  from public.providers p
  where p.consent_token = p_token and p.consent_token_used_at is null and p.status = 'invited';
$$;

-- Service key only: the provider has no account.
revoke execute on function public.consent_preview(uuid) from public, anon, authenticated;
grant execute on function public.consent_preview(uuid) to service_role;
