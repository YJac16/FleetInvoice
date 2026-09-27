-- Phase 2: SECURITY DEFINER document registration (service role only).

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
declare
  v_driver_id uuid;
begin
  if p_actor is null or p_org is null then
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

  if exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.role::text = any (
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
  ) then
    return true;
  end if;

  if p_source = 'driver' then
    v_driver_id := public.current_driver_id(p_org);
    return v_driver_id is not null
      and p_subject_kind = 'driver'
      and p_subject_id = v_driver_id
      and exists (
        select 1
        from public.organisations o
        where o.id = p_org
          and o.compliance_driver_uploads_enabled
      );
  end if;

  return false;
end;
$$;

revoke all on function public.compliance_register_actor_ok(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.compliance_register_actor_ok(uuid, uuid, text, uuid, text) to service_role;

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
begin
  if not public.compliance_register_actor_ok(p_actor, p_org, p_subject_kind, p_subject_id, p_source) then
    raise exception 'not_authorised';
  end if;

  if p_side is null or p_side not in ('front', 'back', 'single') then
    raise exception 'invalid_side';
  end if;

  if p_subject_kind = 'driver' then
    if not exists (
      select 1
      from public.drivers d
      where d.id = p_subject_id
        and d.organisation_id = p_org
        and d.deleted_at is null
    ) then
      raise exception 'invalid_subject';
    end if;
    v_path_prefix := p_org::text || '/drivers/' || p_subject_id::text || '/';
    if p_doc_type not in ('driver_licence', 'prdp') then
      raise exception 'invalid_doc_type';
    end if;
  elsif p_subject_kind = 'vehicle' then
    if not exists (
      select 1
      from public.vehicles v
      where v.id = p_subject_id
        and v.organisation_id = p_org
        and v.deleted_at is null
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
    select dd.id
    into v_superseded_id
    from public.driver_documents dd
    where dd.driver_id = p_subject_id
      and dd.doc_type = p_doc_type::public.driver_doc_type
      and dd.side = p_side
      and dd.is_current
      and dd.deleted_at is null
    for update;

    if v_superseded_id is not null then
      update public.driver_documents
      set is_current = false,
          superseded_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      where id = v_superseded_id;
    end if;

    insert into public.driver_documents (
      organisation_id,
      driver_id,
      doc_type,
      side,
      storage_path,
      file_name,
      mime_type,
      size_bytes,
      sha256,
      uploaded_by,
      source,
      review_status
    )
    values (
      p_org,
      p_subject_id,
      p_doc_type::public.driver_doc_type,
      p_side,
      p_storage_path,
      v_name,
      p_mime,
      p_size,
      p_sha256,
      p_actor,
      p_source,
      p_review_status
    )
    returning id into v_new_id;
  else
    select vd.id
    into v_superseded_id
    from public.vehicle_documents vd
    where vd.vehicle_id = p_subject_id
      and vd.doc_type = p_doc_type::public.vehicle_doc_type
      and vd.side = p_side
      and vd.is_current
      and vd.deleted_at is null
      and vd.doc_type in ('license_disk', 'operating_permit', 'registration_certificate')
    for update;

    if v_superseded_id is not null then
      update public.vehicle_documents
      set is_current = false,
          superseded_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      where id = v_superseded_id;
    end if;

    insert into public.vehicle_documents (
      organisation_id,
      vehicle_id,
      name,
      doc_type,
      side,
      storage_path,
      file_name,
      mime_type,
      size_bytes,
      sha256,
      created_by,
      source,
      review_status,
      is_current
    )
    values (
      p_org,
      p_subject_id,
      v_name,
      p_doc_type::public.vehicle_doc_type,
      p_side,
      p_storage_path,
      v_name,
      p_mime,
      p_size,
      p_sha256,
      p_actor,
      p_source,
      p_review_status,
      true
    )
    returning id into v_new_id;
  end if;

  return jsonb_build_object('new_id', v_new_id, 'superseded_id', v_superseded_id);
end;
$$;

revoke all on function public.register_compliance_document(
  uuid, uuid, text, uuid, text, text, text, text, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.register_compliance_document(
  uuid, uuid, text, uuid, text, text, text, text, text, integer, text, text, text
) to service_role;

create or replace function public.soft_delete_compliance_document(
  p_actor uuid,
  p_org uuid,
  p_kind text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.role::text = any (
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
  ) then
    raise exception 'not_authorised';
  end if;

  if p_kind = 'driver' then
    update public.driver_documents
    set deleted_at = timezone('utc', now()),
        is_current = false,
        updated_at = timezone('utc', now())
    where id = p_id
      and organisation_id = p_org
      and deleted_at is null;
  elsif p_kind = 'vehicle' then
    update public.vehicle_documents
    set deleted_at = timezone('utc', now()),
        is_current = false,
        updated_at = timezone('utc', now())
    where id = p_id
      and organisation_id = p_org
      and deleted_at is null;
  else
    raise exception 'invalid_kind';
  end if;
end;
$$;

revoke all on function public.soft_delete_compliance_document(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.soft_delete_compliance_document(uuid, uuid, text, uuid)
  to service_role;

create or replace function public.run_compliance_document_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purged integer := 0;
  v_orphans integer := 0;
  v_temp integer := 0;
begin
  -- Superseded compliance versions: count-based trim (see 00042 trim_superseded_compliance_versions).

  update public.compliance_scan_temp_objects
  set deleted_at = p_now
  where deleted_at is null
    and expires_at < p_now;

  get diagnostics v_temp = row_count;

  update public.compliance_orphan_objects
  set resolved_at = p_now
  where resolved_at is null
    and created_at < p_now - interval '24 hours';

  get diagnostics v_orphans = row_count;

  return jsonb_build_object(
    'temp_rows_marked', v_temp,
    'orphan_rows_resolved', v_orphans,
    'purged_marked', v_purged
  );
end;
$$;

revoke all on function public.run_compliance_document_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.run_compliance_document_retention(timestamptz) to service_role;
