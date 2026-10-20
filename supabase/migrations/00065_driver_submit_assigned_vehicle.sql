-- =============================================================================
-- 00065 — Driver submit uses assigned vehicle only (no client vehicle pick)
-- =============================================================================

-- Revert 00064 driver-wide active vehicle list (drivers see assigned vehicles only).
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or exists (
        select 1 from public.driver_vehicle_assignments a
        where a.vehicle_id = vehicles.id
          and a.driver_id = public.current_driver_id(vehicles.organisation_id)
          and a.ends_on is null
          and a.deleted_at is null
      )
      or exists (
        select 1 from public.trip_assignments ta
        where ta.vehicle_id = vehicles.id
          and ta.driver_id = public.current_driver_id(vehicles.organisation_id)
          and ta.released_at is null
          and ta.deleted_at is null
      )
      or (
        organisation_id in (select public.user_organisation_ids())
        and not public.has_org_role_names(
          organisation_id,
          array['driver']
        )
        and (
          case
            when public.is_company_manager(organisation_id) then
              false
            else
              company_id is null
              or public.has_company_scope(organisation_id, company_id)
          end
        )
      )
    )
  );

drop function if exists public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, uuid, numeric, text
);

create or replace function public.submit_driver_trip(
  p_organisation_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_total_km numeric,
  p_notes text default null
)
returns table (
  trip_id uuid,
  duplicate_warning boolean,
  needs_vehicle boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_driver_id uuid;
  v_pickup text;
  v_dropoff text;
  v_area text;
  v_locations text;
  v_trip_id uuid;
  v_warn boolean;
  v_trip public.trips%rowtype;
  v_vehicle_id uuid;
  v_needs_vehicle boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'Driver profile not found for this organisation';
  end if;

  if not public.has_org_role_names(p_organisation_id, array['driver']) then
    raise exception 'Only drivers can submit trips';
  end if;

  v_pickup := trim(coalesce(p_pickup, ''));
  v_dropoff := trim(coalesce(p_dropoff, ''));
  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if p_total_km is null or p_total_km < 0 then
    raise exception 'Km must be non-negative';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
      and c.status = 'active'
  ) then
    raise exception 'Company not found or inactive';
  end if;

  v_vehicle_id := public.driver_default_vehicle_id(p_organisation_id, v_driver_id);
  v_needs_vehicle := v_vehicle_id is null;

  v_area := v_pickup || ' → ' || v_dropoff;
  v_locations := v_pickup || ' / ' || v_dropoff;

  v_warn := public.driver_trip_duplicate_warning(
    p_organisation_id,
    v_driver_id,
    p_company_id,
    p_planned_start,
    v_area
  );

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    area_text,
    service_locations,
    pax_count,
    total_km,
    notes,
    submitted_by_driver,
    approved_by,
    approved_at,
    rejected_reason,
    created_by
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    'planned'::public.trip_status,
    true,
    v_area,
    v_locations,
    p_pax_count,
    p_total_km,
    nullif(trim(coalesce(p_notes, '')), ''),
    true,
    null,
    null,
    null,
    auth.uid()
  )
  returning id into v_trip_id;

  insert into public.trip_assignments (
    organisation_id,
    trip_id,
    driver_id,
    vehicle_id,
    assigned_by
  )
  values (
    p_organisation_id,
    v_trip_id,
    v_driver_id,
    v_vehicle_id,
    auth.uid()
  );

  select * into v_trip from public.trips where id = v_trip_id;

  insert into public.trip_driver_submission_snapshots (trip_id, organisation_id, payload)
  values (
    v_trip_id,
    p_organisation_id,
    jsonb_build_object(
      'trip', to_jsonb(v_trip),
      'assignment', jsonb_build_object(
        'driver_id', v_driver_id,
        'vehicle_id', v_vehicle_id,
        'needs_vehicle', v_needs_vehicle
      ),
      'submitted_at', timezone('utc', now())
    )
  );

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  needs_vehicle := v_needs_vehicle;
  return next;
end;
$$;

revoke all on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text
) from public, anon;
grant execute on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text
) to authenticated;

create or replace function public.approve_driver_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_vehicle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not public.staff_can_manage_trips(t.organisation_id) then
    raise exception 'Not authorised to approve driver trips';
  end if;

  if not t.submitted_by_driver or t.approved_at is not null then
    raise exception 'Trip is not a pending driver submission';
  end if;

  if coalesce(trim(t.rejected_reason), '') <> '' then
    raise exception 'Trip was rejected; driver must resubmit';
  end if;

  select ta.vehicle_id
  into v_vehicle_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.organisation_id = t.organisation_id
    and ta.deleted_at is null
    and ta.released_at is null
  limit 1;

  if v_vehicle_id is null then
    raise exception 'Assign a vehicle on this trip before approval';
  end if;

  perform public.assert_staff_waybill_billing_ready(
    t.organisation_id,
    t.company_id,
    t.planned_start
  );

  update public.trips
  set
    approved_by = auth.uid(),
    approved_at = timezone('utc', now()),
    rejected_reason = null,
    status = 'completed',
    staff_completed_at = timezone('utc', now()),
    opening_km = 0,
    closing_km = coalesce(total_km, 0),
    total_km = coalesce(total_km, 0)
  where id = p_trip_id
  returning * into t;

  perform public.log_trip_audit(
    t.organisation_id,
    p_trip_id,
    'submission_status',
    'pending',
    'approved',
    null
  );

  insert into public.trip_events (
    organisation_id,
    trip_id,
    event_type,
    actor_id,
    notes,
    metadata
  )
  values (
    t.organisation_id,
    p_trip_id,
    'completed'::public.trip_event_type,
    auth.uid(),
    'Driver submission approved',
    jsonb_build_object('driver_submission', true)
  );

  perform public.sync_staff_trip_invoice_line(p_trip_id, false);

  return t;
end;
$$;

revoke all on function public.approve_driver_trip(uuid) from public, anon;
grant execute on function public.approve_driver_trip(uuid) to authenticated;
