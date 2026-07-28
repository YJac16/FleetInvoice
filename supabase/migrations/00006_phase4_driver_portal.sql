-- =============================================================================
-- WorkOps Phase 4b — Driver portal & trip workflow
-- =============================================================================
-- Requires 00004 + 00005 (trip_status includes assigned/in_progress/completed).
-- Tables: trip_assignments, trip_events; RPCs for assign / start / arrive / complete.

-- ---------------------------------------------------------------------------
-- Event type enum (new type — safe to create and use in same transaction)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'trip_event_type'
  ) then
    create type public.trip_event_type as enum (
      'assigned',
      'started',
      'arrived_stop',
      'completed',
      'cancelled'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- trip_assignments
-- ---------------------------------------------------------------------------

create table if not exists public.trip_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists trip_assignments_org_id_idx
  on public.trip_assignments (organisation_id);
create index if not exists trip_assignments_trip_id_idx
  on public.trip_assignments (trip_id);
create index if not exists trip_assignments_driver_id_idx
  on public.trip_assignments (driver_id);

-- One active assignment per trip
create unique index if not exists trip_assignments_trip_active_uidx
  on public.trip_assignments (trip_id)
  where deleted_at is null and released_at is null;

drop trigger if exists trip_assignments_set_updated_at on public.trip_assignments;
create trigger trip_assignments_set_updated_at
before update on public.trip_assignments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- trip_events (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.trip_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  assignment_id uuid references public.trip_assignments (id) on delete set null,
  event_type public.trip_event_type not null,
  actor_id uuid references auth.users (id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists trip_events_trip_created_idx
  on public.trip_events (trip_id, created_at);
create index if not exists trip_events_org_id_idx
  on public.trip_events (organisation_id);

-- ---------------------------------------------------------------------------
-- Helpers: is current user linked to driver row
-- ---------------------------------------------------------------------------

create or replace function public.current_driver_id(org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.drivers d
  where d.organisation_id = org_id
    and d.profile_id = auth.uid()
    and d.deleted_at is null
  limit 1;
$$;

grant execute on function public.current_driver_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: assign_trip
-- ---------------------------------------------------------------------------

create or replace function public.assign_trip(
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
  assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised to assign trips';
  end if;

  if t.status::text not in ('planned', 'assigned') then
    raise exception 'Trip cannot be assigned in status %', t.status;
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = t.organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found in organisation';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = t.organisation_id
      and v.deleted_at is null
  ) then
    raise exception 'Vehicle not found in organisation';
  end if;

  -- Release any existing active assignment
  update public.trip_assignments
  set released_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where trip_id = p_trip_id
    and deleted_at is null
    and released_at is null;

  insert into public.trip_assignments (
    organisation_id,
    trip_id,
    driver_id,
    vehicle_id,
    assigned_by
  )
  values (
    t.organisation_id,
    p_trip_id,
    p_driver_id,
    p_vehicle_id,
    auth.uid()
  )
  returning id into assignment_id;

  update public.trips
  set status = 'assigned'
  where id = p_trip_id;

  insert into public.trip_events (
    organisation_id,
    trip_id,
    assignment_id,
    event_type,
    actor_id,
    metadata
  )
  values (
    t.organisation_id,
    p_trip_id,
    assignment_id,
    'assigned',
    auth.uid(),
    jsonb_build_object('driver_id', p_driver_id, 'vehicle_id', p_vehicle_id)
  );

  return assignment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: transition_trip (driver / dispatcher)
-- ---------------------------------------------------------------------------

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

  return t;
end;
$$;

grant execute on function public.assign_trip(uuid, uuid, uuid) to authenticated;
grant execute on function public.transition_trip(uuid, public.trip_event_type, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.trip_assignments enable row level security;
alter table public.trip_events enable row level security;

drop policy if exists trip_assignments_select on public.trip_assignments;
create policy trip_assignments_select on public.trip_assignments
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
      or driver_id = public.current_driver_id(organisation_id)
    )
  );

drop policy if exists trip_assignments_insert on public.trip_assignments;
create policy trip_assignments_insert on public.trip_assignments
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists trip_assignments_update on public.trip_assignments;
create policy trip_assignments_update on public.trip_assignments
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists trip_events_select on public.trip_events;
create policy trip_events_select on public.trip_events
  for select
  using (
    public.is_platform_owner()
    or organisation_id in (select public.user_organisation_ids())
  );

-- Inserts via security definer RPCs only (no direct insert policy for authenticated)

comment on table public.trip_assignments is 'Active driver/vehicle assignment for a trip.';
comment on table public.trip_events is 'Immutable trip workflow event log.';
comment on function public.assign_trip(uuid, uuid, uuid) is
  'Assign (or reassign) a driver/vehicle to a planned trip.';
comment on function public.transition_trip(uuid, public.trip_event_type, text, jsonb) is
  'Advance trip status via workflow event (start/arrive/complete/cancel).';
