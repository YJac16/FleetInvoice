-- Phase 2: retention sweeps storage.objects + orphan rows (local PG harness).

alter table storage.objects
  add column if not exists created_at timestamptz not null default now();

create or replace function public.run_compliance_document_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temp integer := 0;
  v_orphan_resolved integer := 0;
  v_storage_purged integer := 0;
  v_orphan_storage integer := 0;
  rec record;
begin
  -- Superseded compliance versions: count-based trim (see 00042 / 00045 run_compliance_document_retention).

  for rec in
    select t.storage_path
    from public.compliance_scan_temp_objects t
    where t.deleted_at is null
      and t.expires_at < p_now
  loop
    delete from storage.objects
    where bucket_id = 'vehicle-docs' and name = rec.storage_path;
    update public.compliance_scan_temp_objects
    set deleted_at = p_now
    where storage_path = rec.storage_path and deleted_at is null;
    v_temp := v_temp + 1;
  end loop;

  for rec in
    select o.storage_path
    from public.compliance_orphan_objects o
    where o.resolved_at is null
  loop
    delete from storage.objects
    where bucket_id = 'vehicle-docs' and name = rec.storage_path;
    update public.compliance_orphan_objects
    set resolved_at = p_now
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
    delete from storage.objects
    where bucket_id = 'vehicle-docs' and name = rec.storage_path;
    v_orphan_storage := v_orphan_storage + 1;
  end loop;

  perform public.write_audit_log(
    null,
    'document.purged',
    'compliance_retention',
    null,
    jsonb_build_object(
      'temp_purged', v_temp,
      'orphan_rows_resolved', v_orphan_resolved,
      'orphan_storage_purged', v_orphan_storage
    )
  );

  return jsonb_build_object(
    'temp_purged', v_temp,
    'orphan_rows_resolved', v_orphan_resolved,
    'orphan_storage_purged', v_orphan_storage,
    'storage_purged', v_storage_purged
  );
end;
$$;
