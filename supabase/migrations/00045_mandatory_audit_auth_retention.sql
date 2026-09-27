-- Mandatory audit, auth boundary for document images, retention clarity.

drop function if exists public.write_audit_log(uuid, text, text, uuid, jsonb);

create or replace function public.write_audit_log(
  p_organisation_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if coalesce(current_setting('app.force_audit_failure', true), '') = 'true' then
    raise exception 'audit_write_failed';
  end if;

  insert into public.audit_logs (
    organisation_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_organisation_id,
    coalesce(p_actor, auth.uid()),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end;
$$;

comment on function public.trim_superseded_compliance_versions(text, uuid, text, text, uuid) is
  'Retention is count/version based, not time based: each (subject, document type, side) retains at most the current version plus one prior accepted version. The oldest prior version is purged only when a second renewal creates a newer prior version.';

-- register_compliance_document: mandatory audit in the same transaction as the document row.
-- NaTIS RC is scan-and-discard / manual fields only — no retained vehicle_documents row.

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

  perform public.write_audit_log(
    p_org,
    case when v_superseded_id is not null then 'document.replaced' else 'document.uploaded' end,
    'compliance_document',
    v_new_id,
    jsonb_build_object(
      'doc_type', p_doc_type,
      'subject_id', p_subject_id,
      'size_bytes', p_size,
      'mime_type', p_mime
    ),
    p_actor
  );

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
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin', 'manager', 'dispatcher', 'supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_kind = 'driver' then
    update public.driver_documents
    set deleted_at = timezone('utc', now()), is_current = false, updated_at = timezone('utc', now())
    where id = p_id and organisation_id = p_org and deleted_at is null;
  elsif p_kind = 'vehicle' then
    update public.vehicle_documents
    set deleted_at = timezone('utc', now()), is_current = false, updated_at = timezone('utc', now())
    where id = p_id and organisation_id = p_org and deleted_at is null;
  else
    raise exception 'invalid_kind';
  end if;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(p_org, 'document.deleted', 'compliance_document', p_id, '{}'::jsonb, p_actor);
end;
$$;


create or replace function public.save_driver_capture(
  p_actor uuid,
  p_org uuid,
  p_driver_id uuid,
  p_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_driver_id is null then
    insert into public.drivers (
      organisation_id, full_name, email, phone, license_number, license_code, license_code_other,
      license_expires_on, pdp_number, pdp_categories, pdp_expires_on, profile_id, status, created_by
    ) values (
      p_org,
      p_fields->>'full_name',
      nullif(p_fields->>'email',''),
      nullif(p_fields->>'phone',''),
      nullif(p_fields->>'license_number',''),
      nullif(p_fields->>'license_code',''),
      nullif(p_fields->>'license_code_other',''),
      nullif(p_fields->>'license_expires_on','')::date,
      nullif(p_fields->>'pdp_number',''),
      nullif(p_fields->>'pdp_categories',''),
      nullif(p_fields->>'pdp_expires_on','')::date,
      nullif(p_fields->>'profile_id','')::uuid,
      coalesce(p_fields->>'status','active')::public.entity_status,
      p_actor
    ) returning id into v_id;
    v_action := 'driver.created';
  else
    update public.drivers set
      full_name = coalesce(p_fields->>'full_name', full_name),
      email = nullif(p_fields->>'email',''),
      phone = nullif(p_fields->>'phone',''),
      license_number = nullif(p_fields->>'license_number',''),
      license_code = nullif(p_fields->>'license_code',''),
      license_code_other = nullif(p_fields->>'license_code_other',''),
      license_expires_on = nullif(p_fields->>'license_expires_on','')::date,
      pdp_number = nullif(p_fields->>'pdp_number',''),
      pdp_categories = nullif(p_fields->>'pdp_categories',''),
      pdp_expires_on = nullif(p_fields->>'pdp_expires_on','')::date,
      profile_id = nullif(p_fields->>'profile_id','')::uuid,
      status = coalesce(p_fields->>'status', status::text)::public.entity_status,
      updated_at = timezone('utc', now())
    where id = p_driver_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'driver.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'driver', v_id, jsonb_build_object('full_name', p_fields->>'full_name'), p_actor);
  return v_id;
end;
$$;

create or replace function public.save_vehicle_capture(
  p_actor uuid,
  p_org uuid,
  p_vehicle_id uuid,
  p_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_vehicle_id is null then
    insert into public.vehicles (
      organisation_id, name, registration_number, vin, engine_number, make, model, model_year,
      colour, classification, operating_permit_number, operating_permit_expires_on,
      license_disc_expires_on, vehicle_type, capacity, company_id, status, created_by
    ) values (
      p_org,
      p_fields->>'name',
      nullif(p_fields->>'registration_number',''),
      nullif(p_fields->>'vin',''),
      nullif(p_fields->>'engine_number',''),
      nullif(p_fields->>'make',''),
      nullif(p_fields->>'model',''),
      nullif(p_fields->>'model_year','')::integer,
      nullif(p_fields->>'colour',''),
      nullif(p_fields->>'classification',''),
      nullif(p_fields->>'operating_permit_number',''),
      nullif(p_fields->>'operating_permit_expires_on','')::date,
      nullif(p_fields->>'license_disc_expires_on','')::date,
      coalesce(p_fields->>'vehicle_type','other'),
      nullif(p_fields->>'capacity','')::integer,
      nullif(p_fields->>'company_id','')::uuid,
      coalesce(p_fields->>'status','active')::public.entity_status,
      p_actor
    ) returning id into v_id;
    v_action := 'vehicle.created';
  else
    update public.vehicles set
      name = coalesce(p_fields->>'name', name),
      registration_number = nullif(p_fields->>'registration_number',''),
      vin = nullif(p_fields->>'vin',''),
      engine_number = nullif(p_fields->>'engine_number',''),
      make = nullif(p_fields->>'make',''),
      model = nullif(p_fields->>'model',''),
      model_year = nullif(p_fields->>'model_year','')::integer,
      colour = nullif(p_fields->>'colour',''),
      classification = nullif(p_fields->>'classification',''),
      operating_permit_number = nullif(p_fields->>'operating_permit_number',''),
      operating_permit_expires_on = nullif(p_fields->>'operating_permit_expires_on','')::date,
      license_disc_expires_on = nullif(p_fields->>'license_disc_expires_on','')::date,
      vehicle_type = coalesce(p_fields->>'vehicle_type', vehicle_type),
      capacity = nullif(p_fields->>'capacity','')::integer,
      company_id = nullif(p_fields->>'company_id','')::uuid,
      status = coalesce(p_fields->>'status', status::text)::public.entity_status,
      updated_at = timezone('utc', now())
    where id = p_vehicle_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'vehicle.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'vehicle', v_id, jsonb_build_object('name', p_fields->>'name'), p_actor);
  return v_id;
end;
$$;

revoke all on function public.save_driver_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_driver_capture(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) to service_role;


drop policy if exists driver_documents_select on public.driver_documents;
create policy driver_documents_select on public.driver_documents
  for select using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher'])
      or driver_id = public.current_driver_id(organisation_id)
    )
  );

drop policy if exists vehicle_documents_select on public.vehicle_documents;
create policy vehicle_documents_select on public.vehicle_documents
  for select using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        doc_type not in ('license_disk','operating_permit','registration_certificate')
        and public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher','supervisor'])
      )
      or (
        doc_type in ('license_disk','operating_permit','registration_certificate')
        and public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher'])
      )
      or exists (
        select 1 from public.driver_vehicle_assignments a
        where a.vehicle_id = vehicle_documents.vehicle_id
          and a.driver_id = public.current_driver_id(vehicle_documents.organisation_id)
          and a.ends_on is null and a.deleted_at is null
      )
    )
  );

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
  if p_name is null or position('..' in p_name) > 0 then return false; end if;
  v_org := public.storage_org_id(p_name);
  if v_org is null then return false; end if;
  v_seg2 := public.storage_path_segment(p_name, 2);
  if v_seg2 not in ('drivers', 'vehicles') then return false; end if;
  v_seg3 := public.storage_path_segment(p_name, 3);
  if v_seg3 is null or v_seg3 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  if public.has_org_role_names(v_org, array['organisation_admin','manager','dispatcher']) then
    return exists (
      select 1 from public.organisation_members om
      where om.organisation_id = v_org and om.user_id = auth.uid() and om.status = 'active'
    );
  end if;

  v_driver := public.current_driver_id(v_org);
  if v_driver is null then return false; end if;
  if v_seg2 = 'drivers' then return v_seg3::uuid = v_driver; end if;
  if v_seg2 = 'vehicles' then
    return exists (
      select 1 from public.driver_vehicle_assignments a
      where a.organisation_id = v_org and a.driver_id = v_driver
        and a.vehicle_id = v_seg3::uuid and a.ends_on is null and a.deleted_at is null
    );
  end if;
  return false;
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
    perform public.enqueue_compliance_storage_purge(
      'vehicle-docs', rec.storage_path, null, null, 'temp_expired'
    );
    update public.compliance_scan_temp_objects
    set deleted_at = p_now
    where storage_path = rec.storage_path and deleted_at is null;
    v_temp := v_temp + 1;
  end loop;

  for rec in
    select o.storage_path from public.compliance_orphan_objects o where o.resolved_at is null
  loop
    perform public.enqueue_compliance_storage_purge(
      'vehicle-docs', rec.storage_path, null, null, 'orphan_row'
    );
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
    perform public.enqueue_compliance_storage_purge(
      'vehicle-docs', rec.storage_path, null, null, 'orphan_storage'
    );
    v_orphan_storage := v_orphan_storage + 1;
  end loop;

  return jsonb_build_object(
    'temp_purged', v_temp,
    'orphan_rows_resolved', v_orphan_resolved,
    'orphan_storage_purged', v_orphan_storage,
    'orphan_storage_queued', v_orphan_storage,
    'storage_purge_queued', v_temp + v_orphan_resolved + v_orphan_storage,
    'superseded_trimmed', v_trimmed
  );
end;
$$;

grant execute on function public.purge_compliance_document_storage(uuid, uuid, text) to service_role;

create or replace function public.audit_compliance_document_view(
  p_actor uuid,
  p_org uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor is null or p_org is null or p_document_id is null then
    raise exception 'invalid_args';
  end if;

  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and (
        om.role::text = any (array['organisation_admin','manager','dispatcher'])
        or exists (
          select 1 from public.driver_documents dd
          where dd.id = p_document_id and dd.organisation_id = p_org
            and dd.driver_id = public.current_driver_id(p_org) and dd.deleted_at is null
        )
        or exists (
          select 1 from public.vehicle_documents vd
          join public.driver_vehicle_assignments a
            on a.vehicle_id = vd.vehicle_id and a.organisation_id = p_org
          where vd.id = p_document_id and vd.organisation_id = p_org
            and a.driver_id = public.current_driver_id(p_org)
            and a.ends_on is null and a.deleted_at is null and vd.deleted_at is null
        )
      )
  ) then
    raise exception 'not_authorised';
  end if;

  perform public.write_audit_log(
    p_org,
    'document.viewed',
    'compliance_document',
    p_document_id,
    jsonb_build_object('document_id', p_document_id),
    p_actor
  );
end;
$$;

revoke all on function public.audit_compliance_document_view(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.audit_compliance_document_view(uuid, uuid, uuid) to service_role;

grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to authenticated;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to service_role;
