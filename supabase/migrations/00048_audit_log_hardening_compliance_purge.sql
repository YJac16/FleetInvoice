-- PR38 follow-up: lock down write_audit_log EXECUTE, actor binding, delete purge enqueue.

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
  v_actor uuid;
begin
  if coalesce(current_setting('app.force_audit_failure', true), '') = 'true' then
    raise exception 'audit_write_failed';
  end if;

  if session_user::text = 'service_role' then
    v_actor := coalesce(p_actor, auth.uid());
  elsif session_user::text in ('authenticated', 'anon') then
    v_actor := auth.uid();
  else
    v_actor := coalesce(p_actor, auth.uid());
  end if;

  insert into public.audit_logs (
    organisation_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_organisation_id,
    v_actor,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end;
$$;

comment on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) is
  'Append-only audit writer. EXECUTE limited to service_role; SECURITY DEFINER fleet/compliance RPCs call as owner. Authenticated sessions cannot forge p_actor.';

revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) from public;
revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) from anon;
revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) from authenticated;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to service_role;
alter function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) owner to postgres;

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
declare
  v_storage_path text;
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin', 'manager', 'dispatcher', 'supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_kind = 'driver' then
    select dd.storage_path into v_storage_path
    from public.driver_documents dd
    where dd.id = p_id and dd.organisation_id = p_org and dd.deleted_at is null
    for update;

    if not found then
      raise exception 'not_found';
    end if;

    update public.driver_documents
    set deleted_at = timezone('utc', now()), is_current = false, updated_at = timezone('utc', now())
    where id = p_id and organisation_id = p_org and deleted_at is null;
  elsif p_kind = 'vehicle' then
    select vd.storage_path into v_storage_path
    from public.vehicle_documents vd
    where vd.id = p_id and vd.organisation_id = p_org and vd.deleted_at is null
    for update;

    if not found then
      raise exception 'not_found';
    end if;

    update public.vehicle_documents
    set deleted_at = timezone('utc', now()), is_current = false, updated_at = timezone('utc', now())
    where id = p_id and organisation_id = p_org and deleted_at is null;
  else
    raise exception 'invalid_kind';
  end if;

  if v_storage_path is not null and btrim(v_storage_path) <> '' then
    perform public.enqueue_compliance_storage_purge(
      'vehicle-docs', v_storage_path, p_org, p_id, 'document_deleted'
    );
  end if;

  perform public.write_audit_log(p_org, 'document.deleted', 'compliance_document', p_id, '{}'::jsonb, p_actor);
end;
$$;
