-- =============================================================================
-- WorkOps Phase 11c — Staff transport GPS (extends phase 7 gps_points)
-- =============================================================================
-- Requires 00009 (gps_points, ingest_gps_points) and 00020 (en-route statuses).
-- Adds trip trail index + validates staff GPS only during en-route statuses.

create index if not exists gps_points_trip_recorded_idx
  on public.gps_points (trip_id, recorded_at)
  where trip_id is not null;

-- ---------------------------------------------------------------------------
-- ingest_gps_points — staff trip status guard when trip_id is set
-- ---------------------------------------------------------------------------

create or replace function public.ingest_gps_points(
  p_organisation_id uuid,
  p_points jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  driver uuid;
  is_ops boolean;
  pt jsonb;
  lat double precision;
  lng double precision;
  acc double precision;
  recorded timestamptz;
  veh uuid;
  trp uuid;
  inserted integer := 0;
  prev_lat double precision;
  prev_lng double precision;
  fence record;
  was_inside boolean;
  now_inside boolean;
  staff_trip public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_points is null or jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) = 0 then
    raise exception 'points array required';
  end if;

  if jsonb_array_length(p_points) > 100 then
    raise exception 'Maximum 100 points per batch';
  end if;

  driver := public.current_driver_id(p_organisation_id);
  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    );

  if driver is null and not is_ops then
    raise exception 'Not authorised to publish GPS';
  end if;

  if driver is null then
    if (p_points->0->>'driver_id') is null then
      raise exception 'driver_id required when not publishing as linked driver';
    end if;
    driver := (p_points->0->>'driver_id')::uuid;
    if not exists (
      select 1 from public.drivers d
      where d.id = driver
        and d.organisation_id = p_organisation_id
        and d.deleted_at is null
    ) then
      raise exception 'Driver not found';
    end if;
  end if;

  select lp.latitude, lp.longitude into prev_lat, prev_lng
  from public.gps_last_positions lp
  where lp.organisation_id = p_organisation_id
    and lp.driver_id = driver;

  for pt in select * from jsonb_array_elements(p_points)
  loop
    lat := (pt->>'lat')::double precision;
    lng := (pt->>'lng')::double precision;
    if lat is null or lng is null then
      raise exception 'Each point requires lat and lng';
    end if;
    if lat < -90 or lat > 90 or lng < -180 or lng > 180 then
      raise exception 'Invalid coordinates';
    end if;

    acc := nullif(pt->>'accuracy_m', '')::double precision;
    recorded := coalesce(
      nullif(pt->>'recorded_at', '')::timestamptz,
      timezone('utc', now())
    );
    veh := nullif(pt->>'vehicle_id', '')::uuid;
    trp := nullif(pt->>'trip_id', '')::uuid;

    if trp is not null then
      select * into staff_trip
      from public.trips t
      where t.id = trp
        and t.organisation_id = p_organisation_id
        and t.deleted_at is null;

      if not found then
        raise exception 'Trip not found';
      end if;

      if staff_trip.is_staff_transport then
        if staff_trip.status::text not in ('en_route_pickup', 'en_route_company') then
          raise exception 'GPS only allowed during active en-route staff trips';
        end if;

        if not exists (
          select 1 from public.trip_assignments ta
          where ta.trip_id = trp
            and ta.driver_id = driver
            and ta.released_at is null
            and ta.deleted_at is null
        ) then
          raise exception 'Not assigned to this trip';
        end if;
      end if;
    end if;

    insert into public.gps_points (
      organisation_id,
      driver_id,
      vehicle_id,
      trip_id,
      latitude,
      longitude,
      accuracy_m,
      recorded_at
    )
    values (
      p_organisation_id,
      driver,
      veh,
      trp,
      lat,
      lng,
      acc,
      recorded
    );
    inserted := inserted + 1;

    for fence in
      select g.*
      from public.geofences g
      where g.organisation_id = p_organisation_id
        and g.deleted_at is null
        and g.is_active
    loop
      now_inside := public.haversine_m(lat, lng, fence.center_lat, fence.center_lng) <= fence.radius_m;
      if prev_lat is null then
        was_inside := now_inside;
      else
        was_inside := public.haversine_m(prev_lat, prev_lng, fence.center_lat, fence.center_lng) <= fence.radius_m;
      end if;

      if prev_lat is not null and was_inside is distinct from now_inside then
        insert into public.geofence_events (
          organisation_id,
          geofence_id,
          driver_id,
          event_type,
          latitude,
          longitude,
          recorded_at
        )
        values (
          p_organisation_id,
          fence.id,
          driver,
          case when now_inside then 'enter'::public.geofence_event_type
               else 'exit'::public.geofence_event_type end,
          lat,
          lng,
          recorded
        );

        insert into public.notification_outbox (
          organisation_id,
          channel,
          recipient,
          subject,
          body,
          template_key,
          payload,
          created_by
        )
        select
          p_organisation_id,
          'email',
          lower(trim(d.email)),
          format('Geofence %s: %s', case when now_inside then 'enter' else 'exit' end, fence.name),
          format('Driver %s %s geofence "%s".', d.full_name,
            case when now_inside then 'entered' else 'exited' end, fence.name),
          'geofence.transition',
          jsonb_build_object(
            'geofence_id', fence.id,
            'driver_id', driver,
            'event_type', case when now_inside then 'enter' else 'exit' end
          ),
          auth.uid()
        from public.drivers d
        where d.id = driver
          and d.email is not null
          and length(trim(d.email)) > 0;
      end if;
    end loop;

    prev_lat := lat;
    prev_lng := lng;
  end loop;

  insert into public.gps_last_positions (
    organisation_id,
    driver_id,
    vehicle_id,
    trip_id,
    latitude,
    longitude,
    accuracy_m,
    recorded_at,
    updated_at
  )
  values (
    p_organisation_id,
    driver,
    veh,
    trp,
    lat,
    lng,
    acc,
    recorded,
    timezone('utc', now())
  )
  on conflict (organisation_id, driver_id) do update
  set
    vehicle_id = excluded.vehicle_id,
    trip_id = excluded.trip_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    recorded_at = excluded.recorded_at,
    updated_at = timezone('utc', now())
  where public.gps_last_positions.recorded_at <= excluded.recorded_at;

  return inserted;
end;
$$;
