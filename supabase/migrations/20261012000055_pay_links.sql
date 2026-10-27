-- A Pro trader's own card payment link, requested by the owner for traders who already take cards with SumUp,
-- Square, PayPal and the like instead of connecting Stripe: the link shows on their unpaid invoices as "Pay by card".
-- We can't see those payments, so the trader marks the invoice paid as for a bank transfer. Only https links on a
-- fixed list of payment providers are accepted (lib/pay-link.ts has the same list), so an invoice can't send customers
-- anywhere else.
--
-- * public.trader_pay_links: the link, one per listing.
-- * my_pay_link / set_my_pay_link (the trader; setting needs Pro, clearing doesn't).
-- * public_doc gains pay_link on an invoice, while the listing has Pro.
-- Re-runnable.

create table if not exists public.trader_pay_links (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  url text not null check (
    char_length(url) <= 300
    and url ~ '^https://(www\.)?(pay\.sumup\.com|sumup\.me|sumup\.link|square\.link|checkout\.square\.site|paypal\.me|paypal\.com|buy\.stripe\.com|monzo\.me|revolut\.me|settleup\.starlingbank\.com)/[^\s<>"]+$'
  ),
  updated_at timestamptz not null default now()
);
alter table public.trader_pay_links enable row level security;
revoke all on public.trader_pay_links from public, anon, authenticated, service_role;

-- The listing's link, or null. The linked trader only.
create or replace function public.my_pay_link(p_provider uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid := private.my_listing_id(p_provider);
begin
  return (select url from public.trader_pay_links where provider_id = v_id);
end;
$$;

-- Sets (Pro only) or clears (null or empty: any plan) the link. Raises bad_link, pro_needed or not_your_listing.
create or replace function public.set_my_pay_link(p_provider uuid, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_url is null then
    v_id := private.my_listing_id(p_provider);
    delete from public.trader_pay_links where provider_id = v_id;
    return;
  end if;
  v_id := private.my_pro_listing_id(p_provider);
  if char_length(v_url) > 300
     or v_url !~ '^https://(www\.)?(pay\.sumup\.com|sumup\.me|sumup\.link|square\.link|checkout\.square\.site|paypal\.me|paypal\.com|buy\.stripe\.com|monzo\.me|revolut\.me|settleup\.starlingbank\.com)/[^\s<>"]+$' then
    raise exception 'bad_link';
  end if;
  insert into public.trader_pay_links (provider_id, url) values (v_id, v_url)
  on conflict (provider_id) do update set url = excluded.url, updated_at = now();
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'pay_link_set', 'provider', v_id::text, v_url);
end;
$$;

revoke execute on function public.my_pay_link(uuid) from public, anon;
revoke execute on function public.set_my_pay_link(uuid, text) from public, anon;
grant execute on function public.my_pay_link(uuid) to authenticated;
grant execute on function public.set_my_pay_link(uuid, text) to authenticated;

-- The customer's copy (as 000036), plus pay_link on an invoice while the listing has Pro.
create or replace function public.public_doc(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.trade_docs;
  p public.providers;
begin
  select * into v from public.trade_docs where token = p_token and status <> 'draft';
  if v.id is null then
    return null;
  end if;
  select * into p from public.providers where id = v.provider_id;
  return jsonb_build_object(
    'doc', private.doc_json(v) - 'customer_phone' - 'customer_email' - 'job_request_id' - 'token' - 'ask_review',
    'business_name', p.business_name,
    'slug', case when p.status = 'live' then p.slug end,
    'phone', p.phone_e164,
    'bank', case when v.kind = 'invoice' then (
      select jsonb_build_object('account_name', b.account_name, 'sort_code', b.sort_code, 'account_number', b.account_number)
      from public.trader_billing b where b.provider_id = v.provider_id) end,
    'pay_link', case when v.kind = 'invoice' and private.is_pro(v.provider_id) then (
      select l.url from public.trader_pay_links l where l.provider_id = v.provider_id) end
  );
end;
$$;
revoke execute on function public.public_doc(uuid) from public, anon, authenticated;
grant execute on function public.public_doc(uuid) to service_role;
