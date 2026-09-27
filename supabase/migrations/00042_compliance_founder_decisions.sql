-- Founder decisions 27 Sep 2026: no driver compliance writes; count-based superseded retention.

create extension if not exists pgcrypto;

-- Ops roles only — drivers never register/replace compliance documents.
create or replace function public.compliance_register_actor_ok(
  p_actor uuid,
  p_org uuid,
  p_subject_kind text,
  p_subject_id uuid,
  p_source text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_actor is null or p_org is null then
    return false;
  end if;

  if p_source = 'driver' then
    return false;
  end if;

  if not exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.role::text = any (
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
  );
end;
$$;

create or replace function public.purge_compliance_document_storage(
  p_org uuid,
  p_document_id uuid,
  p_storage_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  delete from storage.objects
  where bucket_id = 'vehicle-docs' and name = p_storage_path;

  v_hash := encode(digest(convert_to(p_storage_path, 'UTF8'), 'sha256'), 'hex');

  perform public.write_audit_log(
    p_org,
    'document.purged',
    'compliance_document',
    p_document_id,
    jsonb_build_object('object_ref', v_hash)
  );
end;
$$;

revoke all on function public.purge_compliance_document_storage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.purge_compliance_document_storage(uuid, uuid, text) to service_role;

-- Keep current + at most one prior superseded version per (subject, doc_type, side).
create or replace function public.trim_superseded_compliance_versions(
  p_subject_kind text,
  p_subject_id uuid,
  p_doc_type text,
  p_side text,
  p_org uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purged integer := 0;
  rec record;
begin
  if p_subject_kind = 'driver' then
    for rec in
      select id, storage_path
      from (
        select
          dd.id,
          dd.storage_path,
          row_number() over (order by dd.superseded_at asc nulls last) as rn,
          count(*) over () as cnt
        from public.driver_documents dd
        where dd.driver_id = p_subject_id
          and dd.doc_type = p_doc_type::public.driver_doc_type
          and dd.side = p_side
          and dd.organisation_id = p_org
          and dd.is_current = false
          and dd.deleted_at is null
          and dd.superseded_at is not null
      ) ranked
      where cnt > 1 and rn < cnt
    loop
      update public.driver_documents
      set deleted_at = timezone('utc', now()),
          is_current = false,
          updated_at = timezone('utc', now())
      where id = rec.id;

      perform public.purge_compliance_document_storage(p_org, rec.id, rec.storage_path);
      v_purged := v_purged + 1;
    end loop;
  elsif p_subject_kind = 'vehicle' then
    for rec in
      select id, storage_path
      from (
        select
          vd.id,
          vd.storage_path,
          row_number() over (order by vd.superseded_at asc nulls last) as rn,
          count(*) over () as cnt
        from public.vehicle_documents vd
        where vd.vehicle_id = p_subject_id
          and vd.doc_type = p_doc_type::public.vehicle_doc_type
          and vd.side = p_side
          and vd.organisation_id = p_org
          and vd.is_current = false
          and vd.deleted_at is null
          and vd.superseded_at is not null
          and vd.doc_type in ('license_disk', 'operating_permit', 'registration_certificate')
      ) ranked
      where cnt > 1 and rn < cnt
    loop
      update public.vehicle_documents
      set deleted_at = timezone('utc', now()),
          is_current = false,
          updated_at = timezone('utc', now())
      where id = rec.id;

      perform public.purge_compliance_document_storage(p_org, rec.id, rec.storage_path);
      v_purged := v_purged + 1;
    end loop;
  end if;

  return v_purged;
end;
$$;

revoke all on function public.trim_superseded_compliance_versions(text, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.trim_superseded_compliance_versions(text, uuid, text, text, uuid) to service_role;

create or replace function public.register_compliance_document(
  p_actor uuid,
  p_org uuid,
  p_subject_kind text,
  p_subject_id uuid,
  p_doc_type text,
  p_side text,
  p_storage_path text,
  p_file_name text,
  p_mime text,
  p_size integer,
  p_sha256 text,
  p_source text,
  p_review_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_superseded_id uuid;
  v_new_id uuid;
  v_path_prefix text;
  v_name text;
  v_trimmed integer;
begin
  if not public.compliance_register_actor_ok(p_actor, p_org, p_subject_kind, p_subject_id, p_source) then
    raise exception 'not_authorised';
  end if;

  if p_side is null or p_side not in ('front', 'back', 'single') then
    raise exception 'invalid_side';
  end if;

  if p_subject_kind = 'driver' then
    if not exists (
      select 1 from public.drivers d
      where d.id = p_subject_id and d.organisation_id = p_org and d.deleted_at is null
    ) then
      raise exception 'invalid_subject';
    end if;
    v_path_prefix := p_org::text || '/drivers/' || p_subject_id::text || '/';
    if p_doc_type not in ('driver_licence', 'prdp') then
      raise exception 'invalid_doc_type';
    end if;
  elsif p_subject_kind = 'vehicle' then
    if not exists (
      select 1 from public.vehicles v
      where v.id = p_subject_id and v.organisation_id = p_org and v.deleted_at is null
    ) then
      raise exception 'invalid_subject';
    end if;
    v_path_prefix := p_org::text || '/vehicles/' || p_subject_id::text || '/';
    if p_doc_type not in ('license_disk', 'operating_permit', 'registration_certificate') then
      raise exception 'invalid_doc_type';
    end if;
  else
    raise exception 'invalid_subject_kind';
  end if;

  if p_storage_path is null
    or left(p_storage_path, length(v_path_prefix)) <> v_path_prefix
    or position('..' in p_storage_path) > 0
  then
    raise exception 'invalid_storage_path';
  end if;

  v_name := coalesce(nullif(btrim(p_file_name), ''), 'document');

  perform pg_advisory_xact_lock(hashtext(p_subject_id::text || p_doc_type || p_side));

  if p_subject_kind = 'driver' then
    select dd.id into v_superseded_id
    from public.driver_documents dd
    where dd.driver_id = p_subject_id
      and dd.doc_type = p_doc_type::public.driver_doc_type
      and dd.side = p_side
      and dd.is_current and dd.deleted_at is null
    for update;

    if v_superseded_id is not null then
      update public.driver_documents
      set is_current = false, superseded_at = timezone('utc', now()), updated_at = timezone('utc', now())
      where id = v_superseded_id;
    end if;

    insert into public.driver_documents (
      organisation_id, driver_id, doc_type, side, storage_path, file_name, mime_type,
      size_bytes, sha256, uploaded_by, source, review_status
    ) values (
      p_org, p_subject_id, p_doc_type::public.driver_doc_type, p_side, p_storage_path, v_name, p_mime,
      p_size, p_sha256, p_actor, p_source, p_review_status
    ) returning id into v_new_id;
  else
    select vd.id into v_superseded_id
    from public.vehicle_documents vd
    where vd.vehicle_id = p_subject_id
      and vd.doc_type = p_doc_type::public.vehicle_doc_type
      and vd.side = p_side
      and vd.is_current and vd.deleted_at is null
      and vd.doc_type in ('license_disk', 'operating_permit', 'registration_certificate')
    for update;

    if v_superseded_id is not null then
      update public.vehicle_documents
      set is_current = false, superseded_at = timezone('utc', now()), updated_at = timezone('utc', now())
      where id = v_superseded_id;
    end if;

    insert into public.vehicle_documents (
      organisation_id, vehicle_id, name, doc_type, side, storage_path, file_name, mime_type,
      size_bytes, sha256, created_by, source, review_status, is_current
    ) values (
      p_org, p_subject_id, v_name, p_doc_type::public.vehicle_doc_type, p_side, p_storage_path, v_name, p_mime,
      p_size, p_sha256, p_actor, p_source, p_review_status, true
    ) returning id into v_new_id;
  end if;

  v_trimmed := public.trim_superseded_compliance_versions(
    p_subject_kind, p_subject_id, p_doc_type, p_side, p_org
  );

  return jsonb_build_object(
    'new_id', v_new_id,
    'superseded_id', v_superseded_id,
    'purged_superseded', v_trimmed
  );
end;
$$;

create or replace function public.run_compliance_document_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temp integer := 0;
  v_orphan_resolved integer := 0;
  v_orphan_storage integer := 0;
  v_trimmed integer := 0;
  grp record;
  rec record;
begin
  for grp in
    select distinct 'driver'::text as kind, driver_id as subject_id, doc_type::text, side, organisation_id
    from public.driver_documents
    where deleted_at is null
    union
    select distinct 'vehicle'::text, vehicle_id, doc_type::text, side, organisation_id
    from public.vehicle_documents
    where deleted_at is null
      and doc_type in ('license_disk', 'operating_permit', 'registration_certificate')
  loop
    v_trimmed := v_trimmed + public.trim_superseded_compliance_versions(
      grp.kind, grp.subject_id, grp.doc_type, grp.side, grp.organisation_id
    );
  end loop;

  for rec in
    select t.storage_path
    from public.compliance_scan_temp_objects t
    where t.deleted_at is null and t.expires_at < p_now
  loop
    delete from storage.objects where bucket_id = 'vehicle-docs' and name = rec.storage_path;
    update public.compliance_scan_temp_objects
    set deleted_at = p_now
    where storage_path = rec.storage_path and deleted_at is null;
    v_temp := v_temp + 1;
  end loop;

  for rec in
    select o.storage_path from public.compliance_orphan_objects o where o.resolved_at is null
  loop
    delete from storage.objects where bucket_id = 'vehicle-docs' and name = rec.storage_path;
    update public.compliance_orphan_objects set resolved_at = p_now
    where storage_path = rec.storage_path and resolved_at is null;
    v_orphan_resolved := v_orphan_resolved + 1;
  end loop;

  for rec in
    select so.name as storage_path
    from storage.objects so
    where so.bucket_id = 'vehicle-docs'
      and (storage.foldername(so.name))[2] in ('drivers', 'vehicles')
      and so.created_at < p_now - interval '24 hours'
      and not exists (
        select 1 from public.driver_documents dd
        where dd.storage_path = so.name and dd.deleted_at is null
      )
      and not exists (
        select 1 from public.vehicle_documents vd
        where vd.storage_path = so.name and vd.deleted_at is null
      )
  loop
    delete from storage.objects where bucket_id = 'vehicle-docs' and name = rec.storage_path;
    v_orphan_storage := v_orphan_storage + 1;
  end loop;

  return jsonb_build_object(
    'temp_purged', v_temp,
    'orphan_rows_resolved', v_orphan_resolved,
    'orphan_storage_purged', v_orphan_storage,
    'superseded_trimmed', v_trimmed
  );
end;
$$;

grant execute on function public.purge_compliance_document_storage(uuid, uuid, text) to service_role;
