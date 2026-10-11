-- Supabase-compatible roles, schemas and extensions for the local stack.
-- Idempotent: run by start.sh on every start, before Supabase Auth boots.
-- Mirrors what the supabase/postgres image sets up so that migrations, RLS
-- policies and pgTAP tests behave the same as under `supabase start`.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit createrole;
  end if;
end
$$;

alter role service_role bypassrls;
alter role authenticator with login noinherit password 'postgres';
alter role supabase_auth_admin with login noinherit createrole password 'postgres';
alter role supabase_auth_admin set search_path = auth;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- auth schema: owned by Supabase Auth, which runs its own migrations into it
-- (auth.users, auth.uid(), auth.role(), auth.jwt(), ...).
create schema if not exists auth authorization supabase_auth_admin;
alter schema auth owner to supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
grant all on schema auth to postgres;

-- extensions schema, as on Supabase; on the default search_path.
create schema if not exists extensions;
grant usage on schema extensions to public, anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;
alter database postgres set search_path = "$user", public, extensions;

-- public schema grants (db-reset.sh re-applies these after recreating public).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
