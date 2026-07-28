-- =============================================================================
-- WorkOps Phase 3 — Routes, scheduling, trip planning
-- =============================================================================
-- routes, route_stops, schedules, trips (planned), generate_trips RPC
-- Requires 00001–00003 (has_org_role_names, has_company_scope).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'trip_status'
  ) then
    create type public.trip_status as enum ('planned', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Routes
-- ---------------------------------------------------------------------------

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  area_id uuid references public.areas (id) on delete set null,
  name text not null,
  code text,
  description text,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists routes_org_id_idx on public.routes (organisation_id);
create index if not exists routes_company_id_idx on public.routes (company_id);

drop trigger if exists routes_set_updated_at on public.routes;
create trigger routes_set_updated_at
before update on public.routes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Route stops (ordered)
-- ---------------------------------------------------------------------------

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  sequence int not null,
  site_id uuid references public.sites (id) on delete set null,
  pickup_point_id uuid references public.pickup_points (id) on delete set null,
  label text,
  dwell_minutes int,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint route_stops_sequence_positive check (sequence > 0),
  constraint route_stops_site_or_pickup check (
    site_id is not null or pickup_point_id is not null or label is not null
  )
);

create index if not exists route_stops_route_id_idx on public.route_stops (route_id);
create unique index if not exists route_stops_route_sequence_active_uidx
  on public.route_stops (route_id, sequence)
  where deleted_at is null;

drop trigger if exists route_stops_set_updated_at on public.route_stops;
create trigger route_stops_set_updated_at
before update on public.route_stops
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  name text not null,
  days_of_week smallint[] not null,
  depart_time time not null,
  effective_from date not null,
  effective_to date,
  timezone text not null default 'UTC',
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint schedules_days_nonempty check (cardinality(days_of_week) > 0),
  constraint schedules_effective_window check (
    effective_to is null or effective_to >= effective_from
  )
);

create index if not exists schedules_org_id_idx on public.schedules (organisation_id);
create index if not exists schedules_route_id_idx on public.schedules (route_id);

drop trigger if exists schedules_set_updated_at on public.schedules;
create trigger schedules_set_updated_at
before update on public.schedules
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Trips (planned instances)
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  schedule_id uuid references public.schedules (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  planned_start timestamptz not null,
  planned_end timestamptz,
  status public.trip_status not null default 'planned',
  generation_key text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists trips_org_planned_start_idx
  on public.trips (organisation_id, planned_start);
create index if not exists trips_route_id_idx on public.trips (route_id);
create index if not exists trips_schedule_id_idx on public.trips (schedule_id);
create unique index if not exists trips_generation_key_active_uidx
  on public.trips (organisation_id, generation_key)
  where generation_key is not null and deleted_at is null;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- generate_trips RPC (idempotent via generation_key)
-- ---------------------------------------------------------------------------

create or replace function public.generate_trips(
  p_organisation_id uuid,
  p_from date,
  p_to date,
  p_schedule_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int := 0;
  sched record;
  d date;
  dow int;
  planned timestamptz;
  gkey text;
  row_count int;
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
    raise exception 'Not authorised to generate trips';
  end if;

  if p_to < p_from then
    raise exception 'p_to must be >= p_from';
  end if;

  for sched in
    select s.*, r.company_id as route_company_id
    from public.schedules s
    join public.routes r on r.id = s.route_id
    where s.organisation_id = p_organisation_id
      and s.deleted_at is null
      and s.status = 'active'
      and r.deleted_at is null
      and (p_schedule_id is null or s.id = p_schedule_id)
  loop
    d := p_from;
    while d <= p_to loop
      if d >= sched.effective_from
         and (sched.effective_to is null or d <= sched.effective_to)
      then
        dow := extract(dow from d)::int;
        if dow = any (sched.days_of_week) then
          planned := (d::text || ' ' || sched.depart_time::text)::timestamp
            at time zone coalesce(nullif(sched.timezone, ''), 'UTC');
          gkey := sched.id::text || ':' || to_char(planned at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

          insert into public.trips (
            organisation_id,
            route_id,
            schedule_id,
            company_id,
            planned_start,
            status,
            generation_key,
            created_by
          )
          select
            p_organisation_id,
            sched.route_id,
            sched.id,
            sched.route_company_id,
            planned,
            'planned',
            gkey,
            auth.uid()
          where not exists (
            select 1
            from public.trips t
            where t.organisation_id = p_organisation_id
              and t.generation_key = gkey
              and t.deleted_at is null
          );

          get diagnostics row_count = row_count;
          inserted := inserted + row_count;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.generate_trips(uuid, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.schedules enable row level security;
alter table public.trips enable row level security;

-- routes
drop policy if exists routes_select on public.routes;
create policy routes_select on public.routes
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

drop policy if exists routes_insert on public.routes;
create policy routes_insert on public.routes
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists routes_update on public.routes;
create policy routes_update on public.routes
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

drop policy if exists routes_delete on public.routes;
create policy routes_delete on public.routes
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

-- route_stops
drop policy if exists route_stops_select on public.route_stops;
create policy route_stops_select on public.route_stops
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
    )
  );

drop policy if exists route_stops_insert on public.route_stops;
create policy route_stops_insert on public.route_stops
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists route_stops_update on public.route_stops;
create policy route_stops_update on public.route_stops
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

drop policy if exists route_stops_delete on public.route_stops;
create policy route_stops_delete on public.route_stops
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

-- schedules
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
    )
  );

drop policy if exists schedules_insert on public.schedules;
create policy schedules_insert on public.schedules
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists schedules_update on public.schedules;
create policy schedules_update on public.schedules
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

drop policy if exists schedules_delete on public.schedules;
create policy schedules_delete on public.schedules
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

-- trips
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
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

drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

comment on table public.routes is 'Reusable route definitions for trip planning.';
comment on table public.route_stops is 'Ordered stops on a route (site and/or pickup point).';
comment on table public.schedules is 'Recurring departure rules that generate planned trips.';
comment on table public.trips is 'Planned trip instances. Execution (assignments/events) is Phase 4.';
comment on function public.generate_trips(uuid, date, date, uuid) is
  'Idempotently insert planned trips for active schedules in [p_from, p_to].';
