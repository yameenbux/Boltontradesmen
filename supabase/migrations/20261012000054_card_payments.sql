-- Card payments for Pro traders, requested by the owner, with no cut for Bolton Vouched: a trader connects their own
-- Stripe account (Stripe Connect, a full Stripe account of their own: they pay Stripe's fee and handle their own
-- refunds and disputes), then their customers can pay an invoice, or a deposit on an accepted quote, by card. The
-- money goes straight to the trader's Stripe account; it never touches ours.
--
-- * public.trader_stripe: the listing's connected account and whether Stripe lets it take payments yet.
-- * trade_docs.deposit_pence (a quote's optional deposit, set by the trader; never more than the total is asked), deposit_paid_pence / deposit_paid_at
--   (paid by card), paid_by_card (an invoice paid by card). An invoice made from a quote whose deposit was paid asks
--   only for what's left.
-- * public.card_payments: one row per Stripe Checkout session paid, so a payment is recorded once whether the
--   customer's return or Stripe's webhook gets there first.
-- * set_my_quote_deposit, my_card_payments (the trader); doc_card_payment, record_card_payment, set_stripe_account,
--   update_stripe_account, stripe_account_of (the server).
-- Re-runnable.

-- ---------------------------------------------------------------- the connected account
create table if not exists public.trader_stripe (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  account_id text not null unique check (account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trader_stripe enable row level security;
revoke all on public.trader_stripe from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- deposits and card payments on docs
alter table public.trade_docs add column if not exists deposit_pence bigint;
alter table public.trade_docs add column if not exists deposit_paid_pence bigint;
alter table public.trade_docs add column if not exists deposit_paid_at timestamptz;
alter table public.trade_docs add column if not exists paid_by_card boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trade_docs_deposit_check') then
    alter table public.trade_docs add constraint trade_docs_deposit_check check (
      (deposit_pence is null or (kind = 'quote' and deposit_pence >= 100))
      and (deposit_paid_pence is null or (kind = 'quote' and deposit_paid_pence > 0 and deposit_paid_at is not null)));
  end if;
end $$;

create table if not exists public.card_payments (
  session_id text primary key check (session_id ~ '^cs_[A-Za-z0-9_]{6,200}$'),
  doc_id uuid not null references public.trade_docs (id) on delete cascade,
  what text not null check (what in ('invoice', 'deposit')),
  amount_pence bigint not null check (amount_pence > 0),
  created_at timestamptz not null default now()
);
alter table public.card_payments enable row level security;
revoke all on public.card_payments from public, anon, authenticated, service_role;

-- What a doc carries (as 000036), plus the deposit, card payment and, on an invoice made from a quote, what was
-- paid up front (left to pay = total - paid_upfront_pence).
create or replace function private.doc_json(d public.trade_docs) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'number', d.number, 'token', d.token, 'status', d.status,
    'customer_name', d.customer_name, 'customer_phone', d.customer_phone, 'customer_email', d.customer_email,
    'title', d.title, 'lines', d.lines, 'total_pence', d.total_pence, 'notes', d.notes, 'until', d.until,
    'ask_review', d.ask_review, 'job_request_id', d.job_request_id, 'quote_id', d.quote_id,
    'created_at', d.created_at, 'sent_at', d.sent_at, 'answered_at', d.answered_at, 'paid_at', d.paid_at,
    'invoice_id', (select i.id from public.trade_docs i where i.quote_id = d.id and i.kind = 'invoice' limit 1),
    'deposit_pence', d.deposit_pence, 'deposit_paid_pence', d.deposit_paid_pence, 'deposit_paid_at', d.deposit_paid_at,
    'paid_by_card', d.paid_by_card,
    'paid_upfront_pence', case when d.kind = 'invoice' then coalesce(
      (select q.deposit_paid_pence from public.trade_docs q where q.id = d.quote_id), 0) else 0 end
  );
$$;
revoke execute on function private.doc_json(public.trade_docs) from public, anon, authenticated;

-- A quote's deposit (in pence; null for none), while it's still a draft or sent: at least £1, at most the total.
-- Pro only. Raises not_found, locked, bad_deposit, pro_needed.
create or replace function public.set_my_quote_deposit(p_doc uuid, p_pence bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.trade_docs;
begin
  select * into v from public.trade_docs where id = p_doc and kind = 'quote' for update;
  if v.id is null then
    raise exception 'not_found';
  end if;
  perform private.my_pro_listing_id(v.provider_id);
  if v.status not in ('draft', 'sent') then
    raise exception 'locked';
  end if;
  if p_pence is not null and (p_pence < 100 or p_pence > v.total_pence) then
    raise exception 'bad_deposit';
  end if;
  update public.trade_docs set deposit_pence = p_pence, updated_at = now() where id = v.id;
end;
$$;
revoke execute on function public.set_my_quote_deposit(uuid, bigint) from public, anon;
grant execute on function public.set_my_quote_deposit(uuid, bigint) to authenticated;

-- The dashboard's card payment state: {connected, charges_enabled, details_submitted}. The linked trader only.
create or replace function public.my_card_payments(p_provider uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid := private.my_listing_id(p_provider);
  s public.trader_stripe;
begin
  select * into s from public.trader_stripe where provider_id = v_id;
  return jsonb_build_object('connected', s.provider_id is not null,
                            'charges_enabled', coalesce(s.charges_enabled, false),
                            'details_submitted', coalesce(s.details_submitted, false));
end;
$$;
revoke execute on function public.my_card_payments(uuid) from public, anon;
grant execute on function public.my_card_payments(uuid) to authenticated;

-- ---------------------------------------------------------------- the server's side (service role)
-- The listing's connected account id, or null.
create or replace function public.stripe_account_of(p_provider uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select account_id from public.trader_stripe where provider_id = p_provider;
$$;

-- Stores the account the app just created for the listing (once: a second call keeps the first and returns it).
create or replace function public.set_stripe_account(p_provider uuid, p_account text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v text;
begin
  insert into public.trader_stripe (provider_id, account_id) values (p_provider, p_account)
  on conflict (provider_id) do nothing;
  select account_id into v from public.trader_stripe where provider_id = p_provider;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (null, 'stripe_account_linked', 'provider', p_provider::text, v);
  return v;
end;
$$;

-- What Stripe says about the account now (from the dashboard's check or the account.updated webhook).
create or replace function public.update_stripe_account(p_account text, p_charges boolean, p_details boolean) returns void
language sql security definer set search_path = ''
as $$
  update public.trader_stripe set charges_enabled = p_charges, details_submitted = p_details, updated_at = now()
  where account_id = p_account
    and (charges_enabled is distinct from p_charges or details_submitted is distinct from p_details);
$$;

-- What the customer can pay by card on this doc now, or null: the rest of an unpaid invoice, or the deposit on an
-- accepted quote not yet paid. Only while the listing has Pro and Stripe lets its account take payments.
-- {doc_id, what, amount_pence, account_id, label, business_name, token}.
create or replace function public.doc_card_payment(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.trade_docs;
  s public.trader_stripe;
  v_what text;
  v_amount bigint;
begin
  select * into v from public.trade_docs where token = p_token;
  if v.id is null then
    return null;
  end if;
  select * into s from public.trader_stripe where provider_id = v.provider_id and charges_enabled;
  if s.provider_id is null or not private.is_pro(v.provider_id) then
    return null;
  end if;
  if v.kind = 'invoice' and v.status = 'unpaid' then
    v_what := 'invoice';
    v_amount := v.total_pence - coalesce((select q.deposit_paid_pence from public.trade_docs q where q.id = v.quote_id), 0);
  elsif v.kind = 'quote' and v.status = 'accepted' and v.deposit_pence is not null and v.deposit_paid_at is null
        and not exists (select 1 from public.trade_docs i where i.quote_id = v.id and i.kind = 'invoice') then
    v_what := 'deposit';
    -- The quote's lines may have changed since the deposit was set: never more than the total.
    v_amount := least(v.deposit_pence, v.total_pence);
  else
    return null;
  end if;
  if v_amount < 30 then
    return null;
  end if;
  return jsonb_build_object(
    'doc_id', v.id, 'what', v_what, 'amount_pence', v_amount, 'account_id', s.account_id, 'token', v.token,
    'label', case v.kind when 'quote' then 'Q-' else 'INV-' end || lpad(v.number::text, 4, '0'),
    'business_name', (select business_name from public.providers where id = v.provider_id));
end;
$$;

-- Records a paid Checkout session (from the customer's return or Stripe's webhook, whichever is first), checked
-- against what's payable: the same doc, the connected account it was paid to, the amount. Returns
-- {result: 'recorded' | 'already' | 'mismatch' | 'not_payable', kind, ask_review}.
create or replace function public.record_card_payment(p_session text, p_doc uuid, p_account text, p_amount bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.trade_docs;
  v_pay jsonb;
begin
  -- The doc's lock makes the customer's return and the webhook take turns.
  select * into v from public.trade_docs where id = p_doc for update;
  if exists (select 1 from public.card_payments where session_id = p_session) then
    return jsonb_build_object('result', 'already');
  end if;
  if v.id is null then
    return jsonb_build_object('result', 'not_payable');
  end if;
  v_pay := public.doc_card_payment(v.token);
  if v_pay is null then
    return jsonb_build_object('result', 'not_payable');
  end if;
  if v_pay ->> 'account_id' <> p_account or (v_pay ->> 'amount_pence')::bigint <> p_amount then
    return jsonb_build_object('result', 'mismatch');
  end if;
  insert into public.card_payments (session_id, doc_id, what, amount_pence)
  values (p_session, v.id, v_pay ->> 'what', p_amount);
  if v_pay ->> 'what' = 'invoice' then
    update public.trade_docs set status = 'paid', paid_at = now(), paid_by_card = true, updated_at = now() where id = v.id;
  else
    update public.trade_docs set deposit_paid_pence = p_amount, deposit_paid_at = now(), updated_at = now() where id = v.id;
  end if;
  return jsonb_build_object('result', 'recorded', 'kind', v_pay ->> 'what', 'ask_review', v.kind = 'invoice' and v.ask_review);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.stripe_account_of(uuid)',
    'public.set_stripe_account(uuid, text)',
    'public.update_stripe_account(text, boolean, boolean)',
    'public.doc_card_payment(uuid)',
    'public.record_card_payment(text, uuid, text, bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
