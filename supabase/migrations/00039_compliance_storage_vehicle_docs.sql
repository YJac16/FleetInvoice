-- Phase 2: vehicle-docs bucket + storage RLS helpers.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-docs',
  'vehicle-docs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_org_id(name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_first text;
begin
  if name is null or btrim(name) = '' then
    return null;
  end if;
  v_first := (storage.foldername(name))[1];
  if v_first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.storage_path_segment(name text, idx integer)
returns text
language sql
immutable
as $$
  select (storage.foldername(name))[idx];
$$;

create or replace function public.compliance_storage_path_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_seg2 text;
  v_seg3 text;
  v_driver uuid;
begin
  if p_name is null or position('..' in p_name) > 0 then
    return false;
  end if;

  v_org := public.storage_org_id(p_name);
  if v_org is null then
    return false;
  end if;

  v_seg2 := public.storage_path_segment(p_name, 2);
  if v_seg2 not in ('drivers', 'vehicles') then
    return false;
  end if;

  v_seg3 := public.storage_path_segment(p_name, 3);
  if v_seg3 is null or v_seg3 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  if not public.has_org_role_names(
    v_org,
    array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
  ) then
    v_driver := public.current_driver_id(v_org);
    if v_driver is null then
      return false;
    end if;
    if v_seg2 = 'drivers' then
      return v_seg3::uuid = v_driver;
    end if;
    if v_seg2 = 'vehicles' then
      return exists (
        select 1
        from public.driver_vehicle_assignments a
        where a.organisation_id = v_org
          and a.driver_id = v_driver
          and a.vehicle_id = v_seg3::uuid
          and a.ends_on is null
          and a.deleted_at is null
      );
    end if;
    return false;
  end if;

  return exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = v_org
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
end;
$$;

grant execute on function public.storage_org_id(text) to authenticated, anon, service_role;
grant execute on function public.storage_path_segment(text, integer) to authenticated, anon, service_role;
grant execute on function public.compliance_storage_path_allowed(text) to authenticated, anon, service_role;

alter table storage.objects enable row level security;

drop policy if exists vehicle_docs_select on storage.objects;
create policy vehicle_docs_select on storage.objects
  for select
  using (
    bucket_id = 'vehicle-docs'
    and public.compliance_storage_path_allowed(name)
  );

drop policy if exists vehicle_docs_insert on storage.objects;
create policy vehicle_docs_insert on storage.objects
  for insert
  with check (false);

drop policy if exists vehicle_docs_update on storage.objects;
create policy vehicle_docs_update on storage.objects
  for update
  using (false);

drop policy if exists vehicle_docs_delete on storage.objects;
create policy vehicle_docs_delete on storage.objects
  for delete
  using (false);
