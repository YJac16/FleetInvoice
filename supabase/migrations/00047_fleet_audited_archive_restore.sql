-- Audited soft-delete and restore for drivers and vehicles (no direct client UPDATE).

create or replace function public.soft_delete_driver(
  p_actor uuid,
  p_org uuid,
  p_driver_id uuid
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
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  update public.drivers
  set
    deleted_at = timezone('utc', now()),
    status = 'inactive'::public.entity_status,
    updated_at = timezone('utc', now())
  where id = p_driver_id
    and organisation_id = p_org
    and deleted_at is null;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'driver.deleted',
    'driver',
    p_driver_id,
    '{}'::jsonb,
    p_actor
  );
end;
$$;

create or replace function public.restore_driver(
  p_actor uuid,
  p_org uuid,
  p_driver_id uuid
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
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  update public.drivers
  set
    deleted_at = null,
    status = 'active'::public.entity_status,
    updated_at = timezone('utc', now())
  where id = p_driver_id
    and organisation_id = p_org
    and deleted_at is not null;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'driver.restored',
    'driver',
    p_driver_id,
    '{}'::jsonb,
    p_actor
  );
end;
$$;

create or replace function public.soft_delete_vehicle(
  p_actor uuid,
  p_org uuid,
  p_vehicle_id uuid
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
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  update public.vehicles
  set
    deleted_at = timezone('utc', now()),
    status = 'inactive'::public.entity_status,
    updated_at = timezone('utc', now())
  where id = p_vehicle_id
    and organisation_id = p_org
    and deleted_at is null;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'vehicle.deleted',
    'vehicle',
    p_vehicle_id,
    '{}'::jsonb,
    p_actor
  );
end;
$$;

create or replace function public.restore_vehicle(
  p_actor uuid,
  p_org uuid,
  p_vehicle_id uuid
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
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  update public.vehicles
  set
    deleted_at = null,
    status = 'active'::public.entity_status,
    updated_at = timezone('utc', now())
  where id = p_vehicle_id
    and organisation_id = p_org
    and deleted_at is not null;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'vehicle.restored',
    'vehicle',
    p_vehicle_id,
    '{}'::jsonb,
    p_actor
  );
end;
$$;

revoke all on function public.soft_delete_driver(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.restore_driver(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.soft_delete_vehicle(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.restore_vehicle(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.soft_delete_driver(uuid, uuid, uuid) to service_role;
grant execute on function public.restore_driver(uuid, uuid, uuid) to service_role;
grant execute on function public.soft_delete_vehicle(uuid, uuid, uuid) to service_role;
grant execute on function public.restore_vehicle(uuid, uuid, uuid) to service_role;

-- Block hard DELETE; archive/restore use audited RPCs only.
drop policy if exists drivers_delete on public.drivers;
drop policy if exists vehicles_delete on public.vehicles;
