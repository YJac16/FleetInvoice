-- =============================================================================
-- WorkOps Phase 11 — Staff transport driver portal MVP (pivoted)
-- =============================================================================
-- Admin assigns waybill trips → driver Start (opening km) / End (closing km).
-- No driver freeform trip creation. In-app notifications + presence heartbeat.

-- ---------------------------------------------------------------------------
-- Staff transport company enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'staff_transport_company'
  ) then
    create type public.staff_transport_company as enum (
      'lewis_compliance',
      'lewis_head_office',
      'teleperformance',
      'inspire'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Driver notification type enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'driver_notification_type'
  ) then
    create type public.driver_notification_type as enum (
      'admin_message',
      'trip_assigned',
      'trip_updated',
      'trip_cancelled'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Extend trips for staff transport
-- ---------------------------------------------------------------------------

alter table public.trips
  alter column route_id drop not null;

alter table public.trips
  add column if not exists is_staff_transport boolean not null default false,
  add column if not exists staff_company public.staff_transport_company,
  add column if not exists area_text text,
  add column if not exists pax_count int,
  add column if not exists opening_km numeric(10, 1),
  add column if not exists closing_km numeric(10, 1),
  add column if not exists total_km numeric(10, 1),
  add column if not exists waybill_confirmed_at timestamptz,
  add column if not exists staff_started_at timestamptz,
  add column if not exists staff_completed_at timestamptz;

alter table public.trips drop constraint if exists trips_staff_or_route_check;
alter table public.trips add constraint trips_staff_or_route_check check (
  (route_id is not null and is_staff_transport = false)
  or (
    is_staff_transport = true
    and staff_company is not null
    and area_text is not null
  )
);

alter table public.trips drop constraint if exists trips_pax_count_positive;
alter table public.trips add constraint trips_pax_count_positive check (
  pax_count is null or pax_count >= 0
);

alter table public.trips drop constraint if exists trips_km_order_check;
alter table public.trips add constraint trips_km_order_check check (
  opening_km is null
  or closing_km is null
  or closing_km >= opening_km
);

create index if not exists trips_staff_org_planned_idx
  on public.trips (organisation_id, planned_start)
  where is_staff_transport = true and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Driver no-trip days
-- ---------------------------------------------------------------------------

create table if not exists public.driver_no_trip_days (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  trip_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index if not exists driver_no_trip_days_active_uidx
  on public.driver_no_trip_days (organisation_id, driver_id, trip_date)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Driver in-app notifications
-- ---------------------------------------------------------------------------

create table if not exists public.driver_inbox_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  notification_type public.driver_notification_type not null,
  title text not null,
  body text not null,
  trip_id uuid references public.trips (id) on delete set null,
  read_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists driver_inbox_notifications_driver_idx
  on public.driver_inbox_notifications (organisation_id, driver_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Driver presence (heartbeat, not GPS)
-- ---------------------------------------------------------------------------

create table if not exists public.driver_presence (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists driver_presence_org_idx
  on public.driver_presence (organisation_id, last_seen_at desc);

drop trigger if exists driver_presence_set_updated_at on public.driver_presence;
create trigger driver_presence_set_updated_at
before update on public.driver_presence
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.staff_company_display_name(
  p_company public.staff_transport_company
)
returns text
language sql
immutable
as $$
  select case p_company
    when 'lewis_compliance' then 'Lewis Compliance'
    when 'lewis_head_office' then 'Lewis Head Office'
    when 'teleperformance' then 'Teleperformance'
    when 'inspire' then 'Inspire'
  end;
$$;

create or replace function public.resolve_staff_company_id(
  p_organisation_id uuid,
  p_staff_company public.staff_transport_company
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := public.staff_company_display_name(p_staff_company);
  v_id uuid;
begin
  select c.id into v_id
  from public.companies c
  where c.organisation_id = p_organisation_id
    and c.deleted_at is null
    and lower(c.name) = lower(v_name)
  limit 1;

  if v_id is null then
    insert into public.companies (organisation_id, name, code, status, created_by)
    values (
      p_organisation_id,
      v_name,
      p_staff_company::text,
      'active',
      auth.uid()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.calc_total_km(
  p_opening numeric,
  p_closing numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_opening is null or p_closing is null then null
    else round(p_closing - p_opening, 1)
  end;
$$;

create or replace function public.enqueue_driver_notification(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_notification_type public.driver_notification_type,
  p_title text,
  p_body text,
  p_trip_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.driver_inbox_notifications (
    organisation_id,
    driver_id,
    notification_type,
    title,
    body,
    trip_id,
    created_by
  )
  values (
    p_organisation_id,
    p_driver_id,
    p_notification_type,
    p_title,
    p_body,
    p_trip_id,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.assert_staff_trip_driver(p_trip_id uuid)
returns table (trip public.trips, driver_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  v_driver_id := public.current_driver_id(t.organisation_id);
  if v_driver_id is null then
    raise exception 'No driver profile linked';
  end if;

  if not exists (
    select 1 from public.trip_assignments ta
    where ta.trip_id = p_trip_id
      and ta.driver_id = v_driver_id
      and ta.released_at is null
      and ta.deleted_at is null
  ) then
    raise exception 'Not assigned to this trip';
  end if;

  trip := t;
  driver_id := v_driver_id;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: assign_staff_trip (admin waybill assign)
-- ---------------------------------------------------------------------------

create or replace function public.assign_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_staff_company public.staff_transport_company,
  p_area_text text,
  p_pax_count int default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_company_id uuid;
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

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  v_company_id := public.resolve_staff_company_id(p_organisation_id, p_staff_company);

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

  perform public.assign_trip(v_trip_id, p_driver_id, null);

  perform public.enqueue_driver_notification(
    p_organisation_id,
    p_driver_id,
    'trip_assigned',
    'Trip assigned',
    format(
      '%s trip at %s in %s (%s pax)',
      public.staff_company_display_name(p_staff_company),
      to_char(p_planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
      trim(p_area_text),
      p_pax_count
    ),
    v_trip_id
  );

  return v_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_staff_trip (admin waybill edit)
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

  if t.status in ('completed', 'cancelled') then
    raise exception 'Cannot update finished trip';
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

-- ---------------------------------------------------------------------------
-- RPC: cancel_staff_trip (admin)
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

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.released_at is null
    and ta.deleted_at is null
  limit 1;

  t := public.transition_trip(p_trip_id, 'cancelled'::public.trip_event_type);

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
-- RPC: start_staff_trip (driver — opening km, in progress)
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

  t := public.transition_trip(p_trip_id, 'started'::public.trip_event_type);

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: end_staff_trip (driver — closing km, complete)
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

  if t.status::text <> 'in_progress' then
    raise exception 'Trip must be in progress to end';
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

  t := public.transition_trip(p_trip_id, 'completed'::public.trip_event_type);

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: declare_driver_no_trip_day
-- ---------------------------------------------------------------------------

create or replace function public.declare_driver_no_trip_day(
  p_organisation_id uuid,
  p_trip_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_date date;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'No driver profile linked';
  end if;

  v_date := coalesce(p_trip_date, (timezone('Africa/Johannesburg', now()))::date);

  if v_date <> (timezone('Africa/Johannesburg', now()))::date then
    raise exception 'Can only declare no trip for today';
  end if;

  insert into public.driver_no_trip_days (
    organisation_id,
    driver_id,
    trip_date,
    created_by
  )
  values (p_organisation_id, v_driver_id, v_date, auth.uid())
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select d.id into v_id
    from public.driver_no_trip_days d
    where d.organisation_id = p_organisation_id
      and d.driver_id = v_driver_id
      and d.trip_date = v_date
      and d.deleted_at is null;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mark_driver_notification_read
-- ---------------------------------------------------------------------------

create or replace function public.mark_driver_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.driver_inbox_notifications%rowtype;
  v_driver_id uuid;
begin
  select * into n from public.driver_inbox_notifications where id = p_notification_id;
  if not found then
    raise exception 'Notification not found';
  end if;

  v_driver_id := public.current_driver_id(n.organisation_id);
  if v_driver_id is null or v_driver_id <> n.driver_id then
    raise exception 'Not authorised';
  end if;

  update public.driver_inbox_notifications
  set read_at = timezone('utc', now())
  where id = p_notification_id and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: heartbeat_driver_presence
-- ---------------------------------------------------------------------------

create or replace function public.heartbeat_driver_presence(p_organisation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_seen timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'No driver profile linked';
  end if;

  insert into public.driver_presence (driver_id, organisation_id, last_seen_at)
  values (v_driver_id, p_organisation_id, v_seen)
  on conflict (driver_id) do update
  set last_seen_at = v_seen, organisation_id = excluded.organisation_id;

  return v_seen;
end;
$$;

grant execute on function public.assign_staff_trip(uuid, uuid, timestamptz, public.staff_transport_company, text, int) to authenticated;
grant execute on function public.update_staff_trip(uuid, timestamptz, public.staff_transport_company, text, int) to authenticated;
grant execute on function public.cancel_staff_trip(uuid) to authenticated;
grant execute on function public.start_staff_trip(uuid, numeric, boolean) to authenticated;
grant execute on function public.end_staff_trip(uuid, numeric) to authenticated;
grant execute on function public.declare_driver_no_trip_day(uuid, date) to authenticated;
grant execute on function public.mark_driver_notification_read(uuid) to authenticated;
grant execute on function public.heartbeat_driver_presence(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.driver_no_trip_days enable row level security;
alter table public.driver_inbox_notifications enable row level security;
alter table public.driver_presence enable row level security;

drop policy if exists driver_no_trip_days_select on public.driver_no_trip_days;
create policy driver_no_trip_days_select on public.driver_no_trip_days
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
      or driver_id = public.current_driver_id(organisation_id)
    )
  );

drop policy if exists driver_no_trip_days_insert on public.driver_no_trip_days;
create policy driver_no_trip_days_insert on public.driver_no_trip_days
  for insert
  with check (
    driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists driver_inbox_notifications_select on public.driver_inbox_notifications;
create policy driver_inbox_notifications_select on public.driver_inbox_notifications
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists driver_inbox_notifications_update on public.driver_inbox_notifications;
create policy driver_inbox_notifications_update on public.driver_inbox_notifications
  for update
  using (driver_id = public.current_driver_id(organisation_id))
  with check (driver_id = public.current_driver_id(organisation_id));

drop policy if exists driver_presence_select on public.driver_presence;
create policy driver_presence_select on public.driver_presence
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists driver_presence_upsert on public.driver_presence;
create policy driver_presence_upsert on public.driver_presence
  for all
  using (driver_id = public.current_driver_id(organisation_id))
  with check (driver_id = public.current_driver_id(organisation_id));
