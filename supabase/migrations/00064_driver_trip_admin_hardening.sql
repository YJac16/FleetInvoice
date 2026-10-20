-- =============================================================================
-- 00064 — Driver trip admin hardening (verification fixes for 00062/00063)
-- =============================================================================

create or replace function public.normalize_trip_route_label(p_label text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(trim(coalesce(p_label, '')), '\s*→\s*', ' → ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function public.normalize_trip_route_label(text) from public, anon, authenticated;

create or replace function public.staff_can_manage_trips(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager']
    );
$$;

revoke all on function public.staff_can_manage_trips(uuid) from public, anon, authenticated;

drop policy if exists trip_driver_submission_snapshots_select on public.trip_driver_submission_snapshots;
create policy trip_driver_submission_snapshots_select on public.trip_driver_submission_snapshots
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

drop policy if exists trip_billing_overrides_select on public.trip_billing_overrides;
create policy trip_billing_overrides_select on public.trip_billing_overrides
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

drop policy if exists trip_audit_select on public.trip_audit;
create policy trip_audit_select on public.trip_audit
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

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
      or (
        public.has_org_role_names(organisation_id, array['driver'])
        and organisation_id in (select public.user_organisation_ids())
        and status = 'active'
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

drop function if exists public.driver_trip_duplicate_warning(uuid, uuid, timestamptz, text);

create or replace function public.driver_trip_duplicate_warning(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_company_id uuid,
  p_planned_start timestamptz,
  p_route_label text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_route text;
  v_self uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_self := public.current_driver_id(p_organisation_id);

  if public.staff_can_manage_trips(p_organisation_id)
    or public.has_org_role_names(
      p_organisation_id,
      array['dispatcher', 'supervisor']
    )
    or public.is_platform_owner() then
    null;
  elsif v_self is null or p_driver_id is distinct from v_self then
    raise exception 'Not authorised to check duplicates for this driver';
  end if;

  v_route := public.normalize_trip_route_label(p_route_label);

  return exists (
    select 1
    from public.trips t
    left join public.trip_assignments ta
      on ta.trip_id = t.id
      and ta.organisation_id = t.organisation_id
      and ta.deleted_at is null
      and ta.released_at is null
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.is_staff_transport
      and t.status <> 'cancelled'
      and coalesce(trim(t.rejected_reason), '') = ''
      and abs(extract(epoch from (t.planned_start - p_planned_start))) <= 45 * 60
      and public.normalize_trip_route_label(t.area_text) = v_route
      and (
        ta.driver_id = p_driver_id
        or t.company_id = p_company_id
      )
  );
end;
$$;

revoke all on function public.driver_trip_duplicate_warning(
  uuid, uuid, uuid, timestamptz, text
) from public, anon;
grant execute on function public.driver_trip_duplicate_warning(
  uuid, uuid, uuid, timestamptz, text
) to authenticated;

revoke all on function public.assert_staff_trip_invoice_editable(uuid) from public, anon, authenticated;

revoke all on function public.log_trip_audit(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- submit_driver_trip: duplicate check uses new signature (in 00063 body — patch via replace)
create or replace function public.submit_driver_trip(
  p_organisation_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_vehicle_id uuid,
  p_total_km numeric,
  p_notes text default null
)
returns table (trip_id uuid, duplicate_warning boolean)
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

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and v.status = 'active'
  ) then
    raise exception 'Vehicle not found or inactive';
  end if;

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
    p_vehicle_id,
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
        'vehicle_id', p_vehicle_id
      ),
      'submitted_at', timezone('utc', now())
    )
  );

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, uuid, numeric, text
) from public, anon;
grant execute on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, uuid, numeric, text
) to authenticated;

drop function if exists public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
);

create or replace function public.admin_create_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_vehicle_id uuid,
  p_total_km numeric,
  p_notes text default null,
  p_mark_completed boolean default false
)
returns table (trip_id uuid, duplicate_warning boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pickup text;
  v_dropoff text;
  v_area text;
  v_locations text;
  v_trip_id uuid;
  v_warn boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.staff_can_manage_trips(p_organisation_id) then
    raise exception 'Not authorised';
  end if;

  v_pickup := trim(coalesce(p_pickup, ''));
  v_dropoff := trim(coalesce(p_dropoff, ''));
  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
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

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and v.status = 'active'
  ) then
    raise exception 'Vehicle not found or inactive';
  end if;

  v_area := v_pickup || ' → ' || v_dropoff;
  v_locations := v_pickup || ' / ' || v_dropoff;

  v_warn := public.driver_trip_duplicate_warning(
    p_organisation_id,
    p_driver_id,
    p_company_id,
    p_planned_start,
    v_area
  );

  if p_mark_completed then
    perform public.assert_staff_waybill_billing_ready(
      p_organisation_id,
      p_company_id,
      p_planned_start
    );
  end if;

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
    created_by
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    (case when p_mark_completed then 'completed' else 'planned' end)::public.trip_status,
    true,
    v_area,
    v_locations,
    p_pax_count,
    p_total_km,
    nullif(trim(coalesce(p_notes, '')), ''),
    false,
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
    p_driver_id,
    p_vehicle_id,
    auth.uid()
  );

  perform public.log_trip_audit(
    p_organisation_id,
    v_trip_id,
    'created',
    null,
    'admin_manual',
    'Admin manual trip'
  );

  if p_mark_completed then
    update public.trips
    set
      staff_completed_at = timezone('utc', now()),
      opening_km = 0,
      closing_km = coalesce(p_total_km, 0),
      total_km = coalesce(p_total_km, 0)
    where id = v_trip_id;

    perform public.sync_staff_trip_invoice_line(v_trip_id, false);
  end if;

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
) from public, anon;
grant execute on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
) to authenticated;

create or replace function public.approve_driver_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
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

create or replace function public.reject_driver_trip(p_trip_id uuid, p_reason text)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'Rejection reason is required';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not public.staff_can_manage_trips(t.organisation_id) then
    raise exception 'Not authorised to reject driver trips';
  end if;

  if not t.submitted_by_driver or t.approved_at is not null then
    raise exception 'Trip is not a pending driver submission';
  end if;

  update public.trips
  set rejected_reason = v_reason,
      status = 'cancelled'
  where id = p_trip_id
  returning * into t;

  perform public.log_trip_audit(
    t.organisation_id,
    p_trip_id,
    'submission_status',
    'pending',
    'rejected',
    v_reason
  );

  perform public.sync_staff_trip_invoice_line(p_trip_id, true);

  return t;
end;
$$;

revoke all on function public.reject_driver_trip(uuid, text) from public, anon;
grant execute on function public.reject_driver_trip(uuid, text) to authenticated;

-- Block driver ops on unapproved driver submissions
create or replace function public.start_staff_trip(
  p_trip_id uuid,
  p_opening_km numeric,
  p_waybill_confirmed boolean default true
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
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

  if public.driver_submission_pending(t) then
    raise exception 'Driver submission must be approved before starting this trip';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_org_member(t.organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

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

revoke all on function public.start_staff_trip(uuid, numeric, boolean) from public, anon;
grant execute on function public.start_staff_trip(uuid, numeric, boolean) to authenticated;

create or replace function public.advance_staff_trip_en_route(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
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

  if public.driver_submission_pending(t) then
    raise exception 'Driver submission must be approved before advancing this trip';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_org_member(t.organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text <> 'en_route_pickup' then
    raise exception 'Trip must be en route to pickup to advance';
  end if;

  return public.set_staff_trip_status(
    p_trip_id,
    'en_route_company'::public.trip_status,
    'arrived_stop'::public.trip_event_type,
    'En route to company',
    jsonb_build_object('from_status', 'en_route_pickup', 'to_status', 'en_route_company')
  );
end;
$$;

revoke all on function public.advance_staff_trip_en_route(uuid) from public, anon;
grant execute on function public.advance_staff_trip_en_route(uuid) to authenticated;

create or replace function public.end_staff_trip(
  p_trip_id uuid,
  p_closing_km numeric
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ctx record;
  t public.trips%rowtype;
  v_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if public.driver_submission_pending(t) then
    raise exception 'Driver submission must be approved before ending this trip';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_org_member(t.organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text <> 'en_route_company' then
    raise exception 'Trip must be en route to company before completing';
  end if;

  if p_closing_km is null or t.opening_km is null or p_closing_km < t.opening_km then
    raise exception 'Closing km must be >= opening km';
  end if;

  v_total := public.calc_total_km(t.opening_km, p_closing_km);

  update public.trips
  set
    closing_km = p_closing_km,
    total_km = v_total,
    staff_completed_at = timezone('utc', now())
  where id = p_trip_id;

  return public.set_staff_trip_status(
    p_trip_id,
    'completed'::public.trip_status,
    'completed'::public.trip_event_type,
    'Trip completed',
    jsonb_build_object('closing_km', p_closing_km, 'total_km', v_total)
  );
end;
$$;

revoke all on function public.end_staff_trip(uuid, numeric) from public, anon;
grant execute on function public.end_staff_trip(uuid, numeric) to authenticated;
