-- Minimal Supabase-compatible auth schema for standalone PostgreSQL (local RLS tests).

create schema if not exists auth;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role supabase_auth_admin nologin noinherit;
exception when duplicate_object then null;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to postgres;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- Role used by migration/bootstrap scripts (Supabase image default).
do $$ begin
  create role supabase_admin login superuser password 'postgres';
exception when duplicate_object then
  alter role supabase_admin with superuser login password 'postgres';
end $$;

grant all on schema auth to supabase_admin;
grant all on all tables in schema auth to supabase_admin;
