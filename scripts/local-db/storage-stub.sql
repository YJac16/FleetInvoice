-- Minimal storage schema for local / audit Postgres (hosted Supabase mimic).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin;
  end if;
end $$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  created_at timestamptz not null default now()
);

alter table storage.objects owner to supabase_storage_admin;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

-- Mimic hosted Supabase: block direct DELETE unless Storage API bypass GUC is set.
create or replace function storage.protect_objects_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('storage.allow_object_delete', true), '') = 'true' then
    return old;
  end if;
  raise exception 'direct delete from storage.objects is not allowed (use Storage API purge queue)';
end;
$$;

drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete
  before delete on storage.objects
  for each row
  execute function storage.protect_objects_delete();

grant usage on schema storage to authenticated, anon, service_role;
grant select on storage.buckets to authenticated, anon, service_role;
grant select on storage.objects to authenticated, anon, service_role;

grant usage on schema storage to supabase_storage_admin;
grant delete on storage.objects to supabase_storage_admin;

grant supabase_storage_admin to supabase_admin;
grant supabase_storage_admin to postgres;
