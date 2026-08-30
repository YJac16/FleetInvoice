-- =============================================================================
-- WorkOps Phase 2 — Master Data Completeness
-- =============================================================================
-- drivers.profile_id, vehicle_documents, partial unique indexes, sites company scope
-- Requires 00002 (has_company_scope, has_org_role_names).

-- ---------------------------------------------------------------------------
-- Drivers ↔ profiles
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create index if not exists drivers_profile_id_idx on public.drivers (profile_id);

-- ---------------------------------------------------------------------------
-- Vehicle document type enum + table
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'vehicle_doc_type'
  ) then
    create type public.vehicle_doc_type as enum (
      'license_disk',
      'insurance',
      'roadworthy',
      'other'
    );
  end if;
end $$;

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  name text not null,
  doc_type public.vehicle_doc_type not null default 'other',
  storage_path text,
  file_name text,
  mime_type text,
  expires_at date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists vehicle_documents_org_id_idx
  on public.vehicle_documents (organisation_id);
create index if not exists vehicle_documents_vehicle_id_idx
  on public.vehicle_documents (vehicle_id);
create index if not exists vehicle_documents_expires_at_idx
  on public.vehicle_documents (expires_at);

drop trigger if exists vehicle_documents_set_updated_at on public.vehicle_documents;
create trigger vehicle_documents_set_updated_at
before update on public.vehicle_documents
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Partial unique indexes (active rows only)
-- ---------------------------------------------------------------------------

create unique index if not exists vehicles_org_registration_active_uidx
  on public.vehicles (organisation_id, lower(registration_number))
  where registration_number is not null
    and btrim(registration_number) <> ''
    and deleted_at is null;

create unique index if not exists employees_org_employee_number_active_uidx
  on public.employees (organisation_id, lower(employee_number))
  where employee_number is not null
    and btrim(employee_number) <> ''
    and deleted_at is null;

create unique index if not exists drivers_org_license_active_uidx
  on public.drivers (organisation_id, lower(license_number))
  where license_number is not null
    and btrim(license_number) <> ''
    and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Sites SELECT — company_manager scoped by company_id
-- ---------------------------------------------------------------------------

drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- vehicle_documents RLS
-- ---------------------------------------------------------------------------

alter table public.vehicle_documents enable row level security;

drop policy if exists vehicle_documents_select on public.vehicle_documents;
create policy vehicle_documents_select on public.vehicle_documents
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
    )
  );

drop policy if exists vehicle_documents_insert on public.vehicle_documents;
create policy vehicle_documents_insert on public.vehicle_documents
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists vehicle_documents_update on public.vehicle_documents;
create policy vehicle_documents_update on public.vehicle_documents
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists vehicle_documents_delete on public.vehicle_documents;
create policy vehicle_documents_delete on public.vehicle_documents
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

comment on column public.drivers.profile_id is
  'Optional link to an auth profile for driver portal access (Phase 4).';
comment on table public.vehicle_documents is
  'Vehicle compliance/document metadata; files live in Storage bucket vehicle-docs.';
