-- =============================================================================
-- 00080: mask trip prices in RPC returns
-- =============================================================================
-- 00079 revoked column SELECT on trips.manual_unit_price / manual_price_area_key
-- from authenticated, but these SECURITY DEFINER RPCs return a full
-- public.trips row to the caller (including drivers and employees):
--   transition_trip, cancel_staff_trip, start_staff_trip, end_staff_trip,
--   advance_staff_trip_en_route, update_staff_trip, approve_driver_trip,
--   reject_driver_trip.
-- Each is recreated from its latest definition with signature, return type,
-- security and search_path unchanged; the only change is that before the
-- RETURN the two price columns are set to NULL unless
-- public.staff_can_manage_trips(<trip org>) is true for the caller.
-- Internal helpers set_staff_trip_status / assert_staff_trip_driver are not
-- executable by authenticated and are unchanged. No app change is needed.
-- Rollback: supabase/rollback-00080.sql. Not applied to any remote database
-- from the PR; Engineering applies it.
-- =============================================================================

begin;

-- transition_trip (from 00006_phase4_driver_portal.sql)
create or replace function public.transition_trip(
  p_trip_id uuid,
  p_event public.trip_event_type,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  a public.trip_assignments%rowtype;
  new_status text;
  is_ops boolean;
  is_assigned_driver boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  select * into a
  from public.trip_assignments
  where trip_id = p_trip_id
    and deleted_at is null
    and released_at is null
  order by assigned_at desc
  limit 1;

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    );

  is_assigned_driver := a.id is not null
    and a.driver_id = public.current_driver_id(t.organisation_id);

  if not (is_ops or is_assigned_driver) then
    raise exception 'Not authorised to transition this trip';
  end if;

  -- Allowed transitions
  if p_event = 'started' then
    if t.status::text not in ('assigned', 'planned') then
      raise exception 'Cannot start trip from status %', t.status;
    end if;
    if a.id is null then
      raise exception 'Trip has no active assignment';
    end if;
    new_status := 'in_progress';
  elsif p_event = 'arrived_stop' then
    if t.status::text <> 'in_progress' then
      raise exception 'Cannot mark arrive unless trip is in progress';
    end if;
    new_status := 'in_progress';
  elsif p_event = 'completed' then
    if t.status::text not in ('in_progress', 'assigned') then
      raise exception 'Cannot complete trip from status %', t.status;
    end if;
    new_status := 'completed';
  elsif p_event = 'cancelled' then
    if t.status::text in ('completed', 'cancelled') then
      raise exception 'Trip already finished';
    end if;
    new_status := 'cancelled';
  else
    raise exception 'Unsupported event %', p_event;
  end if;

  update public.trips
  set status = new_status::public.trip_status
  where id = p_trip_id
  returning * into t;

  insert into public.trip_events (
    organisation_id,
    trip_id,
    assignment_id,
    event_type,
    actor_id,
    notes,
    metadata
  )
  values (
    t.organisation_id,
    p_trip_id,
    a.id,
    p_event,
    auth.uid(),
    p_notes,
    coalesce(p_metadata, '{}'::jsonb)
  );

  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.transition_trip(uuid, public.trip_event_type, text, jsonb) from public, anon;
grant execute on function public.transition_trip(uuid, public.trip_event_type, text, jsonb) to authenticated;

-- cancel_staff_trip (from 00025_staff_waybill_invoice_sync.sql)
create or replace function public.cancel_staff_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
  v_was_completed boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status = 'cancelled' then
    raise exception 'Trip already cancelled';
  end if;

  v_was_completed := t.status = 'completed';

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.released_at is null
    and ta.deleted_at is null
  limit 1;

  t := public.set_staff_trip_status(
    p_trip_id,
    'cancelled'::public.trip_status,
    'cancelled'::public.trip_event_type,
    case when v_was_completed then 'Waybill voided by admin' else 'Trip cancelled by admin' end,
    jsonb_build_object('void_completed', v_was_completed)
  );

  if v_driver_id is not null and not v_was_completed then
    perform public.enqueue_driver_notification(
      t.organisation_id,
      v_driver_id,
      'trip_cancelled',
      'Trip cancelled',
      format(
        'Your %s trip at %s was cancelled',
        public.staff_company_display_name(t.staff_company),
        to_char(t.planned_start at time zone 'Africa/Johannesburg', 'HH24:MI')
      ),
      p_trip_id
    );
  end if;

  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.cancel_staff_trip(uuid) from public, anon;
grant execute on function public.cancel_staff_trip(uuid) to authenticated;

-- start_staff_trip (from 00064_driver_trip_admin_hardening.sql)
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

  t := public.set_staff_trip_status(
    p_trip_id,
    'en_route_pickup'::public.trip_status,
    'started'::public.trip_event_type,
    'En route to pickup',
    jsonb_build_object('opening_km', p_opening_km)
  );
  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.start_staff_trip(uuid, numeric, boolean) from public, anon;
grant execute on function public.start_staff_trip(uuid, numeric, boolean) to authenticated;

-- end_staff_trip (from 00064_driver_trip_admin_hardening.sql)
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

  t := public.set_staff_trip_status(
    p_trip_id,
    'completed'::public.trip_status,
    'completed'::public.trip_event_type,
    'Trip completed',
    jsonb_build_object('closing_km', p_closing_km, 'total_km', v_total)
  );
  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.end_staff_trip(uuid, numeric) from public, anon;
grant execute on function public.end_staff_trip(uuid, numeric) to authenticated;

-- advance_staff_trip_en_route (from 00064_driver_trip_admin_hardening.sql)
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

  t := public.set_staff_trip_status(
    p_trip_id,
    'en_route_company'::public.trip_status,
    'arrived_stop'::public.trip_event_type,
    'En route to company',
    jsonb_build_object('from_status', 'en_route_pickup', 'to_status', 'en_route_company')
  );
  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.advance_staff_trip_en_route(uuid) from public, anon;
grant execute on function public.advance_staff_trip_en_route(uuid) to authenticated;

-- update_staff_trip (from 00070_route_price_templates.sql)
create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null,
  p_area_text text default null,
  p_pax_count int default null,
  p_total_km numeric default null,
  p_notes text default null,
  p_vehicle_id uuid default null,
  p_edit_reason text default null,
  p_unit_price numeric default null,
  p_apply_unit_price boolean default false
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_company_id uuid;
  v_driver_id uuid;
  v_reason text;
  v_old_vehicle uuid;
  v_new_area text;
  v_old_key text;
  v_new_key text;
  v_route_changed boolean;
  v_manual_price numeric;
  v_manual_key text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  if not public.staff_can_manage_trips(t.organisation_id) then
    raise exception 'Not authorised';
  end if;

  if t.status = 'cancelled' then
    raise exception 'Cannot update cancelled trip';
  end if;

  if t.status::text not in ('assigned', 'planned', 'completed') then
    raise exception 'Cannot update trip in status %', t.status;
  end if;

  v_reason := trim(coalesce(p_edit_reason, ''));
  if v_reason = '' then
    raise exception 'Edit reason is required';
  end if;

  if t.status = 'completed' or exists (
    select 1 from public.invoice_lines il where il.trip_id = p_trip_id
  ) then
    perform public.assert_staff_trip_invoice_editable(p_trip_id);
  end if;

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = t.organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  elsif p_staff_company is not null then
    v_company_id := public.resolve_staff_company_id(t.organisation_id, p_staff_company);
  else
    v_company_id := t.company_id;
  end if;

  if p_vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id
        and v.organisation_id = t.organisation_id
        and v.deleted_at is null
        and v.status = 'active'
    ) then
      raise exception 'Vehicle not found or inactive';
    end if;
  end if;

  if p_apply_unit_price and p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  v_new_area := case
    when p_area_text is null then t.area_text
    else coalesce(nullif(trim(p_area_text), ''), t.area_text)
  end;
  v_old_key := public.route_area_key(coalesce(t.area_text, ''));
  v_new_key := public.route_area_key(coalesce(v_new_area, ''));
  v_route_changed := v_old_key is distinct from v_new_key;

  if p_apply_unit_price then
    v_manual_price := p_unit_price;
    v_manual_key := case when p_unit_price is null then null else v_new_key end;
  elsif v_route_changed or v_company_id is distinct from t.company_id then
    -- A typed price belonged to the previous route or company.
    v_manual_price := null;
    v_manual_key := null;
  else
    v_manual_price := t.manual_unit_price;
    v_manual_key := t.manual_price_area_key;
  end if;

  if p_planned_start is not null and p_planned_start is distinct from t.planned_start then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'planned_start',
      t.planned_start::text, p_planned_start::text, v_reason
    );
  end if;

  if v_company_id is distinct from t.company_id then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'company_id',
      t.company_id::text, v_company_id::text, v_reason
    );
  end if;

  if p_staff_company is not null and p_staff_company is distinct from t.staff_company then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'staff_company',
      t.staff_company::text, p_staff_company::text, v_reason
    );
  end if;

  if p_area_text is not null and nullif(trim(p_area_text), '') is distinct from t.area_text then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'area_text',
      t.area_text, nullif(trim(p_area_text), ''), v_reason
    );
  end if;

  if p_pax_count is not null and p_pax_count is distinct from t.pax_count then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'pax_count',
      t.pax_count::text, p_pax_count::text, v_reason
    );
  end if;

  if p_total_km is not null and p_total_km is distinct from t.total_km then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'total_km',
      t.total_km::text, p_total_km::text, v_reason
    );
  end if;

  if p_notes is not null and nullif(trim(p_notes), '') is distinct from coalesce(t.notes, '') then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'notes',
      t.notes, nullif(trim(p_notes), ''), v_reason
    );
  elsif p_notes is not null and trim(p_notes) = '' and coalesce(t.notes, '') <> '' then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'notes', t.notes, null, v_reason
    );
  end if;

  if p_apply_unit_price and p_unit_price is distinct from t.manual_unit_price then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'manual_unit_price',
      t.manual_unit_price::text, p_unit_price::text, v_reason
    );
  end if;

  update public.trips
  set
    staff_company = coalesce(p_staff_company, staff_company),
    company_id = v_company_id,
    planned_start = coalesce(p_planned_start, planned_start),
    area_text = case
      when p_area_text is null then area_text
      else coalesce(nullif(trim(p_area_text), ''), area_text)
    end,
    pax_count = coalesce(p_pax_count, pax_count),
    total_km = coalesce(p_total_km, total_km),
    notes = case
      when p_notes is null then notes
      else nullif(trim(p_notes), '')
    end,
    closing_km = case
      when t.status = 'completed' and p_total_km is not null then p_total_km
      else closing_km
    end,
    manual_unit_price = v_manual_price,
    manual_price_area_key = v_manual_key,
    reprice_on_next_sync = v_route_changed or reprice_on_next_sync
  where id = p_trip_id
  returning * into t;

  if p_vehicle_id is not null then
    select ta.vehicle_id into v_old_vehicle
    from public.trip_assignments ta
    where ta.trip_id = p_trip_id
      and ta.deleted_at is null
      and ta.released_at is null
    limit 1;

    if v_old_vehicle is distinct from p_vehicle_id then
      perform public.log_trip_audit(
        t.organisation_id, p_trip_id, 'vehicle_id',
        v_old_vehicle::text, p_vehicle_id::text, v_reason
      );
      update public.trip_assignments
      set vehicle_id = p_vehicle_id
      where trip_id = p_trip_id
        and deleted_at is null
        and released_at is null;
    end if;
  end if;

  if t.status = 'completed' then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);
  else
    select ta.driver_id into v_driver_id
    from public.trip_assignments ta
    where ta.trip_id = p_trip_id
      and ta.released_at is null
      and ta.deleted_at is null
    limit 1;

    if v_driver_id is not null then
      perform public.enqueue_driver_notification(
        t.organisation_id,
        v_driver_id,
        'trip_updated',
        'Trip updated',
        format(
          'Waybill updated: %s at %s, %s',
          coalesce(
            (select c.name from public.companies c where c.id = t.company_id),
            public.staff_company_display_name(t.staff_company)
          ),
          to_char(t.planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
          t.area_text
        ),
        p_trip_id
      );
    end if;
  end if;

  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.update_staff_trip(uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, numeric, boolean) from public, anon;
grant execute on function public.update_staff_trip(uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, numeric, boolean) to authenticated;

-- approve_driver_trip (from 00070_route_price_templates.sql)
create or replace function public.approve_driver_trip(
  p_trip_id uuid,
  p_vehicle_id uuid,
  p_unit_price numeric default null,
  p_apply_unit_price boolean default false
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_old_vehicle uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_vehicle_id is null then
    raise exception 'Vehicle is required to approve this trip';
  end if;

  if p_apply_unit_price and p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Price cannot be negative';
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

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = t.organisation_id
      and v.deleted_at is null
      and v.status = 'active'
  ) then
    raise exception 'Vehicle not found or inactive';
  end if;

  select ta.vehicle_id
  into v_old_vehicle
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.organisation_id = t.organisation_id
    and ta.deleted_at is null
    and ta.released_at is null
  limit 1;

  update public.trip_assignments
  set vehicle_id = p_vehicle_id
  where trip_id = p_trip_id
    and organisation_id = t.organisation_id
    and deleted_at is null
    and released_at is null;

  perform public.log_trip_audit(
    t.organisation_id,
    p_trip_id,
    'vehicle_id',
    v_old_vehicle::text,
    p_vehicle_id::text,
    'Assigned on driver trip approval'
  );

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
    total_km = coalesce(total_km, 0),
    manual_unit_price = case
      when p_apply_unit_price and p_unit_price is not null then p_unit_price
      else null
    end,
    manual_price_area_key = case
      when p_apply_unit_price and p_unit_price is not null
        then public.route_area_key(coalesce(t.area_text, ''))
      else null
    end
  where id = p_trip_id
  returning * into t;

  if p_apply_unit_price and p_unit_price is not null then
    perform public.log_trip_audit(
      t.organisation_id,
      p_trip_id,
      'manual_unit_price',
      null,
      p_unit_price::text,
      'Set on driver trip approval'
    );
  end if;

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
    jsonb_build_object('driver_submission', true, 'vehicle_id', p_vehicle_id)
  );

  perform public.sync_staff_trip_invoice_line(p_trip_id, false);

  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.approve_driver_trip(uuid, uuid, numeric, boolean) from public, anon;
grant execute on function public.approve_driver_trip(uuid, uuid, numeric, boolean) to authenticated;

-- reject_driver_trip (from 00064_driver_trip_admin_hardening.sql)
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

  -- 00080: mask billed price columns for callers who cannot manage trips
  if not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;
  return t;
end;
$$;

revoke all on function public.reject_driver_trip(uuid, text) from public, anon;
grant execute on function public.reject_driver_trip(uuid, text) to authenticated;

commit;
