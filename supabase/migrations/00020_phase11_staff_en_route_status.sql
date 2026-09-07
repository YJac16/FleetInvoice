-- =============================================================================
-- WorkOps Phase 11b — Staff transport en-route statuses (status only, no GPS)
-- =============================================================================
-- MUST run after 00019. Adds en_route_pickup / en_route_company to trip_status.
-- Staff flow: assigned → en_route_pickup → en_route_company → completed

alter type public.trip_status add value if not exists 'en_route_pickup';
alter type public.trip_status add value if not exists 'en_route_company';

-- ---------------------------------------------------------------------------
-- Helper: set staff trip status + audit event (staff transport only)
-- ---------------------------------------------------------------------------

create or replace function public.set_staff_trip_status(
  p_trip_id uuid,
  p_new_status public.trip_status,
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
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  select * into a
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.released_at is null
    and ta.deleted_at is null
  limit 1;

  update public.trips
  set status = p_new_status
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

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: start_staff_trip → en_route_pickup + opening km
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

-- ---------------------------------------------------------------------------
-- RPC: advance_staff_trip_en_route → pickup to company
-- ---------------------------------------------------------------------------

create or replace function public.advance_staff_trip_en_route(p_trip_id uuid)
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

-- ---------------------------------------------------------------------------
-- RPC: end_staff_trip → completed + closing km
-- ---------------------------------------------------------------------------

create or replace function public.end_staff_trip(
  p_trip_id uuid,
  p_closing_km numeric
)
returns public.trips
language plpgsql
security definer
set search_path = public
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

-- ---------------------------------------------------------------------------
-- RPC: cancel_staff_trip — allow cancel from en-route states
-- ---------------------------------------------------------------------------

create or replace function public.cancel_staff_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
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

  if t.status::text in ('completed', 'cancelled') then
    raise exception 'Trip already finished';
  end if;

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
    'Trip cancelled by admin'
  );

  if v_driver_id is not null then
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

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_staff_trip — block edits once en route
-- ---------------------------------------------------------------------------

create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_staff_company public.staff_transport_company default null,
  p_area_text text default null,
  p_pax_count int default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_company_id uuid;
  v_driver_id uuid;
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

  if t.status::text not in ('assigned', 'planned') then
    raise exception 'Cannot update trip in status %', t.status;
  end if;

  if p_staff_company is not null then
    v_company_id := public.resolve_staff_company_id(t.organisation_id, p_staff_company);
  else
    v_company_id := t.company_id;
  end if;

  update public.trips
  set
    staff_company = coalesce(p_staff_company, staff_company),
    company_id = v_company_id,
    planned_start = coalesce(p_planned_start, planned_start),
    area_text = coalesce(nullif(trim(p_area_text), ''), area_text),
    pax_count = coalesce(p_pax_count, pax_count)
  where id = p_trip_id
  returning * into t;

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
        public.staff_company_display_name(t.staff_company),
        to_char(t.planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
        t.area_text
      ),
      p_trip_id
    );
  end if;

  return t;
end;
$$;

grant execute on function public.set_staff_trip_status(uuid, public.trip_status, public.trip_event_type, text, jsonb) to authenticated;
grant execute on function public.advance_staff_trip_en_route(uuid) to authenticated;
