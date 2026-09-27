-- Rollback for migration 00048_audit_log_hardening_compliance_purge.sql
-- Reverts write_audit_log actor binding + EXECUTE grants and soft_delete purge enqueue.

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

revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) from public;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to authenticated;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to service_role;

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
