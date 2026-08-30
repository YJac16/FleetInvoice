-- =============================================================================
-- WorkOps Phase 7 — GPS ingest, last-known positions, radius geofences
-- =============================================================================
-- Requires 00001–00008 (current_driver_id, has_org_role_names, notification_outbox).
-- Partitioning deferred: use btree on (organisation_id, recorded_at); add monthly
-- partitions + retention before high-volume GA.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'geofence_event_type'
  ) then
    create type public.geofence_event_type as enum ('enter', 'exit');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- gps_points (append-only trail)
-- ---------------------------------------------------------------------------

create table if not exists public.gps_points (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  trip_id uuid references public.trips (id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint gps_points_lat_check check (latitude >= -90 and latitude <= 90),
  constraint gps_points_lng_check check (longitude >= -180 and longitude <= 180)
);

create index if not exists gps_points_org_recorded_idx
  on public.gps_points (organisation_id, recorded_at desc);
create index if not exists gps_points_driver_recorded_idx
  on public.gps_points (driver_id, recorded_at desc);

alter table public.gps_points enable row level security;

drop policy if exists gps_points_select on public.gps_points;
create policy gps_points_select on public.gps_points
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

-- No direct insert/update/delete — RPC only
drop policy if exists gps_points_insert on public.gps_points;
drop policy if exists gps_points_update on public.gps_points;
drop policy if exists gps_points_delete on public.gps_points;

-- ---------------------------------------------------------------------------
-- gps_last_positions (hot board reads)
-- ---------------------------------------------------------------------------

create table if not exists public.gps_last_positions (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  trip_id uuid references public.trips (id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  recorded_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, driver_id),
  constraint gps_last_lat_check check (latitude >= -90 and latitude <= 90),
  constraint gps_last_lng_check check (longitude >= -180 and longitude <= 180)
);

create index if not exists gps_last_positions_org_recorded_idx
  on public.gps_last_positions (organisation_id, recorded_at desc);

alter table public.gps_last_positions enable row level security;

drop policy if exists gps_last_positions_select on public.gps_last_positions;
create policy gps_last_positions_select on public.gps_last_positions
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists gps_last_positions_insert on public.gps_last_positions;
drop policy if exists gps_last_positions_update on public.gps_last_positions;
drop policy if exists gps_last_positions_delete on public.gps_last_positions;

-- ---------------------------------------------------------------------------
-- geofences (circular MVP)
-- ---------------------------------------------------------------------------

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m double precision not null,
  site_id uuid references public.sites (id) on delete set null,
  pickup_point_id uuid references public.pickup_points (id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint geofences_lat_check check (center_lat >= -90 and center_lat <= 90),
  constraint geofences_lng_check check (center_lng >= -180 and center_lng <= 180),
  constraint geofences_radius_positive check (radius_m > 0)
);

create index if not exists geofences_org_active_idx
  on public.geofences (organisation_id)
  where deleted_at is null and is_active;

drop trigger if exists geofences_set_updated_at on public.geofences;
create trigger geofences_set_updated_at
before update on public.geofences
for each row execute function public.set_updated_at();

alter table public.geofences enable row level security;

drop policy if exists geofences_select on public.geofences;
create policy geofences_select on public.geofences
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
    )
  );

drop policy if exists geofences_insert on public.geofences;
create policy geofences_insert on public.geofences
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists geofences_update on public.geofences;
create policy geofences_update on public.geofences
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists geofences_delete on public.geofences;
create policy geofences_delete on public.geofences
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

-- ---------------------------------------------------------------------------
-- geofence_events (immutable)
-- ---------------------------------------------------------------------------

create table if not exists public.geofence_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  geofence_id uuid not null references public.geofences (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  event_type public.geofence_event_type not null,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists geofence_events_org_recorded_idx
  on public.geofence_events (organisation_id, recorded_at desc);

alter table public.geofence_events enable row level security;

drop policy if exists geofence_events_select on public.geofence_events;
create policy geofence_events_select on public.geofence_events
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists geofence_events_insert on public.geofence_events;
drop policy if exists geofence_events_update on public.geofence_events;
drop policy if exists geofence_events_delete on public.geofence_events;

-- ---------------------------------------------------------------------------
-- Haversine distance (metres)
-- ---------------------------------------------------------------------------

create or replace function public.haversine_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2))
        * power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: ingest_gps_points
-- p_points: [{ lat, lng, recorded_at?, accuracy_m?, vehicle_id?, trip_id? }, ...]
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

  -- Ops ingest must still target a linked driver via first point's driver_id (optional)
  -- For MVP: ops may publish as null driver only if they pass driver_id on each point.
  if driver is null then
    -- require driver_id on first point when not self-driver
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

    -- Geofence enter/exit vs previous last known (or skip enter if no previous)
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

grant execute on function public.haversine_m(
  double precision, double precision, double precision, double precision
) to authenticated;
grant execute on function public.ingest_gps_points(uuid, jsonb) to authenticated;
