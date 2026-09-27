-- Phase 2: queue storage object removal for Supabase Storage API (no direct DELETE on storage.objects).

create table if not exists public.compliance_storage_purge_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'vehicle-docs',
  storage_path text not null,
  organisation_id uuid,
  compliance_document_id uuid,
  reason text not null,
  queued_at timestamptz not null default timezone('utc', now()),
  purged_at timestamptz,
  last_error text,
  attempt_count integer not null default 0
);

create unique index if not exists compliance_storage_purge_queue_pending_uniq
  on public.compliance_storage_purge_queue (bucket_id, storage_path)
  where purged_at is null;

alter table public.compliance_storage_purge_queue enable row level security;

grant select, insert, update on public.compliance_storage_purge_queue to service_role;

comment on table public.compliance_storage_purge_queue is
  'Paths awaiting deletion via Supabase Storage API (service role). DB functions enqueue only.';

create or replace function public.enqueue_compliance_storage_purge(
  p_bucket text,
  p_storage_path text,
  p_org uuid,
  p_document_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_storage_path is null or btrim(p_storage_path) = '' then
    return;
  end if;

  insert into public.compliance_storage_purge_queue (
    bucket_id, storage_path, organisation_id, compliance_document_id, reason
  )
  select
    coalesce(nullif(btrim(p_bucket), ''), 'vehicle-docs'),
    p_storage_path,
    p_org,
    p_document_id,
    coalesce(nullif(btrim(p_reason), ''), 'unspecified')
  where not exists (
    select 1
    from public.compliance_storage_purge_queue q
    where q.bucket_id = coalesce(nullif(btrim(p_bucket), ''), 'vehicle-docs')
      and q.storage_path = p_storage_path
      and q.purged_at is null
  );
end;
$$;

revoke all on function public.enqueue_compliance_storage_purge(text, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_compliance_storage_purge(text, text, uuid, uuid, text)
  to service_role;

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
  rec record;
begin
  for rec in
    select t.storage_path
    from public.compliance_scan_temp_objects t
    where t.deleted_at is null
      and t.expires_at < p_now
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
    select o.storage_path
    from public.compliance_orphan_objects o
    where o.resolved_at is null
  loop
    perform public.enqueue_compliance_storage_purge(
      'vehicle-docs', rec.storage_path, null, null, 'orphan_row'
    );
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
    perform public.enqueue_compliance_storage_purge(
      'vehicle-docs', rec.storage_path, null, null, 'orphan_storage'
    );
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
      'orphan_storage_queued', v_orphan_storage,
      'storage_via', 'queue'
    )
  );

  return jsonb_build_object(
    'temp_purged', v_temp,
    'orphan_rows_resolved', v_orphan_resolved,
    'orphan_storage_purged', v_orphan_storage,
    'orphan_storage_queued', v_orphan_storage,
    'storage_purge_queued', v_temp + v_orphan_resolved + v_orphan_storage
  );
end;
$$;
