-- Founder decision: NaTIS RC is scan-and-discard / manual fields only — no retained vehicle_documents row.

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

  if p_doc_type = 'registration_certificate' then
    raise exception 'rc_permanent_storage_forbidden';
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
    if p_doc_type not in ('license_disk', 'operating_permit') then
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
      and vd.doc_type in ('license_disk', 'operating_permit')
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
