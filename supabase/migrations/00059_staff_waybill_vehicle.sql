-- =============================================================================
-- 00059 — Staff waybills: vehicle on backfill + driver-default on start
-- =============================================================================
-- Requires 00058_staff_waybill_creation_billing_checks.sql (PR #58) applied first.
-- Replaces assign_staff_trip and backfill_staff_waybill (also redefined in 00058);
-- start_staff_trip is only changed in this migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current open driver → vehicle assignment
-- ---------------------------------------------------------------------------

create or replace function public.driver_default_vehicle_id(
  p_organisation_id uuid,
  p_driver_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select dva.vehicle_id
  from public.driver_vehicle_assignments dva
  join public.vehicles v on v.id = dva.vehicle_id
  where dva.organisation_id = p_organisation_id
    and dva.driver_id = p_driver_id
    and dva.ends_on is null
    and dva.deleted_at is null
    and v.organisation_id = p_organisation_id
    and v.deleted_at is null
  order by dva.starts_on desc nulls last, dva.created_at desc
  limit 1;
$$;

comment on function public.driver_default_vehicle_id(uuid, uuid) is
  'Returns the driver''s current open vehicle assignment in the organisation, if any.';

grant execute on function public.driver_default_vehicle_id(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ensure trip assignment has a vehicle (driver default when omitted)
-- ---------------------------------------------------------------------------

create or replace function public.ensure_trip_assignment_vehicle(
  p_trip_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_vehicle_id uuid;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  v_vehicle_id := p_vehicle_id;
  if v_vehicle_id is null then
    v_vehicle_id := public.driver_default_vehicle_id(t.organisation_id, p_driver_id);
  end if;

  if v_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = v_vehicle_id
      and v.organisation_id = t.organisation_id
      and v.deleted_at is null
  ) then
    raise exception 'Vehicle not found in organisation';
  end if;

  if v_vehicle_id is not null then
    update public.trip_assignments
    set vehicle_id = v_vehicle_id,
        updated_at = timezone('utc', now())
    where trip_id = p_trip_id
      and driver_id = p_driver_id
      and released_at is null
      and deleted_at is null
      and (vehicle_id is null or vehicle_id = v_vehicle_id);
  end if;

  return v_vehicle_id;
end;
$$;

grant execute on function public.ensure_trip_assignment_vehicle(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_staff_trip — optional vehicle; defaults to driver assignment
-- ---------------------------------------------------------------------------

drop function if exists public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company
);
drop function if exists public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, uuid
);

create or replace function public.assign_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_area_text text,
  p_pax_count int default 1,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_company_id uuid;
  v_vehicle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised to assign staff trips';
  end if;

  if p_area_text is null or trim(p_area_text) = '' then
    raise exception 'Area is required';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if p_company_id is null and p_staff_company is null then
    raise exception 'Company is required';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  v_vehicle_id := p_vehicle_id;
  if v_vehicle_id is null then
    v_vehicle_id := public.driver_default_vehicle_id(p_organisation_id, p_driver_id);
  end if;

  if v_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = v_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
  ) then
    raise exception 'Vehicle not found in organisation';
  end if;

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = p_organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  else
    v_company_id := public.resolve_staff_company_id(p_organisation_id, p_staff_company);
  end if;

  perform public.assert_staff_waybill_billing_ready(
    p_organisation_id,
    v_company_id,
    p_planned_start
  );

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    staff_company,
    area_text,
    pax_count,
    created_by
  )
  values (
    p_organisation_id,
    null,
    v_company_id,
    p_planned_start,
    'assigned',
    true,
    p_staff_company,
    trim(p_area_text),
    p_pax_count,
    auth.uid()
  )
  returning id into v_trip_id;

  perform public.assign_trip(v_trip_id, p_driver_id, v_vehicle_id);

  perform public.enqueue_driver_notification(
    p_organisation_id,
    p_driver_id,
    'trip_assigned',
    'New waybill',
    format(
      'Waybill: %s at %s, %s',
      coalesce(
        (select c.name from public.companies c where c.id = v_company_id),
        public.staff_company_display_name(p_staff_company)
      ),
      to_char(p_planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
      trim(p_area_text)
    ),
    v_trip_id
  );

  return v_trip_id;
end;
$$;

revoke all on function public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, uuid
) from public;
revoke all on function public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, uuid
) from anon;
grant execute on function public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- backfill_staff_waybill — vehicle required
-- ---------------------------------------------------------------------------

drop function if exists public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric
);

create or replace function public.backfill_staff_waybill(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_area_text text,
  p_pax_count int default 1,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null,
  p_opening_km numeric default null,
  p_closing_km numeric default null,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_company_id uuid;
  v_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised to backfill waybills';
  end if;

  if p_vehicle_id is null then
    raise exception 'Vehicle is required';
  end if;

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
  ) then
    raise exception 'Vehicle not found in organisation';
  end if;

  if p_area_text is null or trim(p_area_text) = '' then
    raise exception 'Area is required';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if p_company_id is null and p_staff_company is null then
    raise exception 'Company is required';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = p_organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  else
    v_company_id := public.resolve_staff_company_id(p_organisation_id, p_staff_company);
  end if;

  perform public.assert_staff_waybill_billing_ready(
    p_organisation_id,
    v_company_id,
    p_planned_start
  );

  if p_opening_km is not null and p_closing_km is not null then
    if p_closing_km < p_opening_km then
      raise exception 'Closing km must be >= opening km';
    end if;
    v_total := public.calc_total_km(p_opening_km, p_closing_km);
  else
    v_total := null;
  end if;

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    staff_company,
    area_text,
    pax_count,
    opening_km,
    closing_km,
    total_km,
    created_by
  )
  values (
    p_organisation_id,
    null,
    v_company_id,
    p_planned_start,
    'planned',
    true,
    p_staff_company,
    trim(p_area_text),
    p_pax_count,
    p_opening_km,
    p_closing_km,
    v_total,
    auth.uid()
  )
  returning id into v_trip_id;

  perform public.assign_trip(v_trip_id, p_driver_id, p_vehicle_id);

  update public.trips
  set status = 'completed',
      staff_completed_at = timezone('utc', now())
  where id = v_trip_id;

  insert into public.trip_events (
    organisation_id,
    trip_id,
    event_type,
    actor_id,
    notes,
    metadata
  )
  values (
    p_organisation_id,
    v_trip_id,
    'completed'::public.trip_event_type,
    auth.uid(),
    'Waybill backfilled by admin',
    jsonb_build_object('admin_backfill', true, 'vehicle_id', p_vehicle_id)
  );

  perform public.sync_staff_trip_invoice_line(v_trip_id, false);

  return v_trip_id;
end;
$$;

revoke all on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric, uuid
) from public;
revoke all on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric, uuid
) from anon;
grant execute on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- start_staff_trip — backfill assignment vehicle from driver default when missing
-- ---------------------------------------------------------------------------

create or replace function public.start_staff_trip(
  p_trip_id uuid,
  p_opening_km numeric,
  p_waybill_confirmed boolean default true
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
  t public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if t.status::text not in ('assigned', 'planned') then
    raise exception 'Trip cannot be started from status %', t.status;
  end if;

  if p_opening_km is null or p_opening_km < 0 then
    raise exception 'Opening km is required';
  end if;

  perform public.ensure_trip_assignment_vehicle(p_trip_id, ctx.driver_id, null);

  update public.trips
  set
    opening_km = p_opening_km,
    waybill_confirmed_at = case when p_waybill_confirmed then timezone('utc', now()) else waybill_confirmed_at end,
    staff_started_at = timezone('utc', now())
  where id = p_trip_id;

  return public.set_staff_trip_status(
    p_trip_id,
    'en_route_pickup'::public.trip_status,
    'started'::public.trip_event_type,
    'En route to pickup',
    jsonb_build_object('opening_km', p_opening_km)
  );
end;
$$;
