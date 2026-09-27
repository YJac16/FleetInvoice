-- Phase 2: compliance document tables, org flags, vehicle_documents extensions.

alter table public.organisations
  add column if not exists compliance_scan_enabled boolean not null default false;

alter table public.organisations
  add column if not exists compliance_driver_uploads_enabled boolean not null default false;

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  driver_id uuid not null references public.drivers (id),
  doc_type public.driver_doc_type not null,
  side text not null default 'single' check (side in ('front', 'back', 'single')),
  storage_path text not null,
  file_name text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text,
  is_current boolean not null default true,
  superseded_at timestamptz,
  retain_until date,
  uploaded_by uuid not null,
  source text not null default 'admin' check (source in ('admin', 'driver')),
  review_status text not null default 'accepted' check (review_status in ('pending_review', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists driver_documents_one_current
  on public.driver_documents (driver_id, doc_type, side)
  where is_current and deleted_at is null;

create index if not exists driver_documents_org_id_idx
  on public.driver_documents (organisation_id);

alter table public.vehicle_documents
  add column if not exists size_bytes integer,
  add column if not exists sha256 text,
  add column if not exists is_current boolean not null default true,
  add column if not exists superseded_at timestamptz,
  add column if not exists retain_until date,
  add column if not exists source text not null default 'admin',
  add column if not exists review_status text not null default 'accepted',
  add column if not exists side text not null default 'single';

do $$ begin
  alter table public.vehicle_documents
    add constraint vehicle_documents_size_bytes_check
    check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicle_documents
    add constraint vehicle_documents_source_check
    check (source in ('admin', 'driver'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicle_documents
    add constraint vehicle_documents_review_status_check
    check (review_status in ('pending_review', 'accepted', 'rejected'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicle_documents
    add constraint vehicle_documents_side_check
    check (side in ('front', 'back', 'single'));
exception when duplicate_object then null; end $$;

create unique index if not exists vehicle_documents_one_current_compliance
  on public.vehicle_documents (vehicle_id, doc_type, side)
  where is_current and deleted_at is null
    and doc_type in ('license_disk', 'operating_permit', 'registration_certificate');

create table if not exists public.compliance_orphan_objects (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  error_code text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.compliance_orphan_objects enable row level security;

create or replace function public.compliance_immutable_driver_document()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organisation_id is distinct from old.organisation_id
      or new.driver_id is distinct from old.driver_id
      or new.storage_path is distinct from old.storage_path
      or new.uploaded_by is distinct from old.uploaded_by
      or new.source is distinct from old.source
    then
      raise exception 'immutable_column';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_documents_immutable on public.driver_documents;
create trigger driver_documents_immutable
before update on public.driver_documents
for each row execute function public.compliance_immutable_driver_document();

create or replace function public.compliance_immutable_vehicle_document()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organisation_id is distinct from old.organisation_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.storage_path is distinct from old.storage_path
    then
      raise exception 'immutable_column';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_documents_immutable on public.vehicle_documents;
create trigger vehicle_documents_immutable
before update on public.vehicle_documents
for each row execute function public.compliance_immutable_vehicle_document();

drop trigger if exists driver_documents_set_updated_at on public.driver_documents;
create trigger driver_documents_set_updated_at
before update on public.driver_documents
for each row execute function public.set_updated_at();

alter table public.driver_documents enable row level security;

drop policy if exists driver_documents_select on public.driver_documents;
create policy driver_documents_select on public.driver_documents
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
      or driver_id = public.current_driver_id(organisation_id)
    )
  );
