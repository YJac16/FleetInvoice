-- =============================================================================
-- ROLLBACK: 00060_supabase_audit_hardening_13_oct.sql
-- =============================================================================
-- Revert the database AND the application together. Run only alongside the app
-- commit that predates 00060 (invitation preview + accept-invite changes).
-- Manual script — not applied by the Supabase CLI migration chain.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Storage policies (pre-00060)
-- ---------------------------------------------------------------------------

drop policy if exists avatars_select_own on storage.objects;
drop policy if exists org_logos_select on storage.objects;
create policy org_logos_select on storage.objects
  for select
  using (bucket_id = 'org-logos');

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select
  using (bucket_id = 'avatars');

-- ---------------------------------------------------------------------------
-- get_invitation_by_token (pre-00060 — full invitations row)
-- ---------------------------------------------------------------------------

drop function if exists public.get_invitation_by_token(text);

create or replace function public.get_invitation_by_token(p_token text)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
begin
  select *
  into inv
  from public.invitations i
  where i.token = p_token
    and i.status = 'pending'
    and i.deleted_at is null
    and i.expires_at > timezone('utc', now());

  if not found then
    return null;
  end if;

  return inv;
end;
$$;

revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scope helpers (pre-00060)
-- ---------------------------------------------------------------------------

create or replace function public.driver_serves_company(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_within_days integer default 90
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.driver_vehicle_assignments dva
    join public.vehicles v on v.id = dva.vehicle_id
    where dva.driver_id = p_driver_id
      and dva.organisation_id = p_organisation_id
      and dva.ends_on is null
      and dva.deleted_at is null
      and v.deleted_at is null
      and v.company_id is not null
      and public.has_company_scope(p_organisation_id, v.company_id)
  )
  or exists (
    select 1
    from public.trip_assignments ta
    join public.trips t on t.id = ta.trip_id
    join public.companies c on c.id = t.company_id
    where ta.driver_id = p_driver_id
      and ta.organisation_id = p_organisation_id
      and ta.deleted_at is null
      and ta.released_at is null
      and t.deleted_at is null
      and t.company_id is not null
      and public.has_company_scope(p_organisation_id, t.company_id)
      and (t.planned_start::date - public.compliance_today_sast()) between -p_within_days and p_within_days
  );
$$;

create or replace function public.vehicle_in_company_scope(
  p_organisation_id uuid,
  p_vehicle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and (
        v.company_id is null
        or public.has_company_scope(p_organisation_id, v.company_id)
      )
  );
$$;

create or replace function public.org_entitled_modules(p_organisation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(distinct e.module_key order by e.module_key)
      from public.subscriptions s
      join public.module_entitlements e on e.plan_id = s.plan_id
      where s.organisation_id = p_organisation_id
        and s.status in ('trialing', 'active')
    ),
    array[
      'core',
      'gps',
      'attendance',
      'billing',
      'payroll',
      'reports',
      'portal'
    ]::text[]
  );
$$;

revoke all on function public.driver_serves_company(uuid, uuid, integer) from public, anon;
grant execute on function public.driver_serves_company(uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.vehicle_in_company_scope(uuid, uuid) from public, anon;
grant execute on function public.vehicle_in_company_scope(uuid, uuid) to authenticated, service_role;

revoke all on function public.org_entitled_modules(uuid) from public, anon;
grant execute on function public.org_entitled_modules(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Staff / employee RPCs — pre-00060 bodies (from 00059 / 00015)
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

drop function if exists public.check_invitation_email(text, text);

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
create or replace function public.update_my_employee_home(
  p_organisation_id uuid,
  p_home_address text default null,
  p_home_latitude double precision default null,
  p_home_longitude double precision default null
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  emp public.employees%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  update public.employees
  set
    home_address = nullif(trim(coalesce(p_home_address, '')), ''),
    home_latitude = coalesce(p_home_latitude, home_latitude),
    home_longitude = coalesce(p_home_longitude, home_longitude),
    updated_at = timezone('utc', now())
  where id = emp_id
  returning * into emp;

  return emp;
end;
$$;
create or replace function public.request_trip_seat(
  p_organisation_id uuid,
  p_trip_id uuid,
  p_direction public.trip_passenger_direction default 'to_work'
)
returns public.trip_passengers
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  trip_row public.trips%rowtype;
  emp public.employees%rowtype;
  existing public.trip_passengers%rowtype;
  has_existing boolean := false;
  confirmed_count integer;
  vehicle_capacity integer;
  new_status public.trip_passenger_status;
  result_row public.trip_passengers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  -- Serialize seat booking per trip to avoid over-confirm under concurrency
  perform pg_advisory_xact_lock(hashtext(p_trip_id::text));

  select * into trip_row
  from public.trips t
  where t.id = p_trip_id
    and t.organisation_id = p_organisation_id
    and t.deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if trip_row.status in ('cancelled', 'completed') then
    raise exception 'Cannot book seat on trip status %', trip_row.status;
  end if;

  select * into emp
  from public.employees e
  where e.id = emp_id
    and e.deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  -- Employees with a company may only book trips for that company (or unscoped trips)
  if emp.company_id is not null
     and trip_row.company_id is not null
     and trip_row.company_id is distinct from emp.company_id then
    raise exception 'Trip is not available for your company';
  end if;

  select * into existing
  from public.trip_passengers tp
  where tp.trip_id = p_trip_id
    and tp.employee_id = emp_id;
  has_existing := found;

  if has_existing then
    if existing.status in ('requested', 'confirmed', 'boarded') then
      raise exception 'Seat already booked for this trip';
    end if;
  end if;

  -- Capacity only counts seats that hold inventory (confirmed + boarded)
  select count(*)::integer into confirmed_count
  from public.trip_passengers tp
  where tp.trip_id = p_trip_id
    and tp.status in ('confirmed', 'boarded');

  select v.capacity into vehicle_capacity
  from public.trip_assignments ta
  join public.vehicles v on v.id = ta.vehicle_id and v.deleted_at is null
  where ta.trip_id = p_trip_id
    and ta.deleted_at is null
    and ta.released_at is null
  order by ta.assigned_at desc
  limit 1;

  if vehicle_capacity is not null and confirmed_count >= vehicle_capacity then
    new_status := 'requested';
  else
    new_status := 'confirmed';
  end if;

  if has_existing and existing.status = 'cancelled' then
    update public.trip_passengers
    set
      direction = coalesce(p_direction, 'to_work'),
      status = new_status,
      requested_at = timezone('utc', now()),
      confirmed_at = case when new_status = 'confirmed' then timezone('utc', now()) else null end,
      cancelled_at = null,
      boarded_at = null,
      updated_at = timezone('utc', now())
    where id = existing.id
    returning * into result_row;
  else
    insert into public.trip_passengers (
      organisation_id,
      trip_id,
      employee_id,
      direction,
      status,
      confirmed_at,
      created_by
    )
    values (
      p_organisation_id,
      p_trip_id,
      emp_id,
      coalesce(p_direction, 'to_work'),
      new_status,
      case when new_status = 'confirmed' then timezone('utc', now()) else null end,
      auth.uid()
    )
    returning * into result_row;
  end if;

  return result_row;
end;
$$;
create or replace function public.cancel_trip_seat(
  p_organisation_id uuid,
  p_trip_id uuid
)
returns public.trip_passengers
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  result_row public.trip_passengers%rowtype;
  vehicle_capacity integer;
  confirmed_count integer;
  waitlisted public.trip_passengers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_trip_id::text));

  update public.trip_passengers
  set
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where trip_id = p_trip_id
    and organisation_id = p_organisation_id
    and employee_id = emp_id
    and status in ('requested', 'confirmed')
  returning * into result_row;

  if not found then
    raise exception 'Active seat booking not found';
  end if;

  -- Promote oldest waitlisted seat when capacity frees up
  select v.capacity into vehicle_capacity
  from public.trip_assignments ta
  join public.vehicles v on v.id = ta.vehicle_id and v.deleted_at is null
  where ta.trip_id = p_trip_id
    and ta.deleted_at is null
    and ta.released_at is null
  order by ta.assigned_at desc
  limit 1;

  select count(*)::integer into confirmed_count
  from public.trip_passengers tp
  where tp.trip_id = p_trip_id
    and tp.status in ('confirmed', 'boarded');

  if vehicle_capacity is null or confirmed_count < vehicle_capacity then
    select * into waitlisted
    from public.trip_passengers tp
    where tp.trip_id = p_trip_id
      and tp.status = 'requested'
    order by tp.requested_at asc
    limit 1;

    if found then
      update public.trip_passengers
      set
        status = 'confirmed',
        confirmed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
      where id = waitlisted.id;
    end if;
  end if;

  return result_row;
end;
$$;

grant all on all tables in schema public to anon;

grant all on table public.compliance_alerts_sent to authenticated;
grant all on table public.compliance_orphan_objects to authenticated;
grant all on table public.compliance_scan_quota to authenticated;
grant all on table public.compliance_scan_temp_objects to authenticated;
grant all on table public.compliance_storage_purge_queue to authenticated;

revoke all on function public.driver_default_vehicle_id(uuid, uuid) from public, anon, authenticated;
grant execute on function public.driver_default_vehicle_id(uuid, uuid) to service_role;

revoke all on function public.ensure_trip_assignment_vehicle(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_trip_assignment_vehicle(uuid, uuid, uuid) to service_role;

revoke all on function public.guard_company_manager_member_scope() from public, anon, authenticated;

-- 00052 SECURITY DEFINER grants (pre-00060 PostgREST surface)
-- =============================================================================
-- 00052 — Security hardening: anon RPC surface, compliance_scan_quota RLS,
--          invoker search_path pins, default function privileges
-- =============================================================================
-- Idempotent on production shape (tggxnvombexvxblsntsm). Revokes EXECUTE from
-- PUBLIC and anon on SECURITY DEFINER public RPCs; re-grants authenticated and
-- service_role per intended surface. Keeps anon EXECUTE on public RPCs
-- (get_invitation_by_token, lookup_white_label) and read-only RLS helpers used
-- when anon evaluates policies on Supabase-SELECTable public tables.

-- ---------------------------------------------------------------------------
-- 1) SECURITY DEFINER RPC grants — revoke PUBLIC/anon; restore role grants
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_args text;
  v_anon_ok text[] := array['get_invitation_by_token', 'lookup_white_label'];
  v_service_only text[] := array[
    'audit_compliance_document_view',
    'compliance_register_actor_ok',
    'consume_compliance_scan_quota',
    'enqueue_compliance_expiry_alerts',
    'enqueue_compliance_renewals_digests',
    'enqueue_compliance_storage_purge',
    'import_drivers_capture',
    'import_vehicles_capture',
    'purge_compliance_document_storage',
    'register_compliance_document',
    'resolve_trip_line_rate',
    'restore_driver',
    'restore_vehicle',
    'run_compliance_document_retention',
    'save_driver_capture',
    'save_vehicle_capture',
    'soft_delete_compliance_document',
    'soft_delete_driver',
    'soft_delete_vehicle',
    'trim_superseded_compliance_versions',
    'write_audit_log'
  ];
begin
  for r in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    v_args := r.args;
    execute format('revoke all on function public.%I(%s) from public', r.proname, v_args);
    execute format('revoke all on function public.%I(%s) from anon', r.proname, v_args);

    if r.proname = any (v_anon_ok) then
      execute format('grant execute on function public.%I(%s) to anon', r.proname, v_args);
    end if;

    if r.proname = 'handle_new_user' then
      -- Auth trigger only; not a PostgREST RPC.
      continue;
    end if;

    if r.proname = any (v_service_only) then
      execute format(
        'revoke all on function public.%I(%s) from authenticated',
        r.proname,
        v_args
      );
      execute format('grant execute on function public.%I(%s) to service_role', r.proname, v_args);
    else
      execute format('grant execute on function public.%I(%s) to authenticated', r.proname, v_args);
      execute format('grant execute on function public.%I(%s) to service_role', r.proname, v_args);
    end if;
  end loop;
end;
$$;

-- Documented anon SECURITY DEFINER exception (10 signatures):
--   get_invitation_by_token(text), lookup_white_label(text),
--   is_platform_owner(), is_org_member(uuid), has_org_role(uuid, app_role[]),
--   has_org_role_names(uuid, text[]), has_company_scope(uuid, uuid),
--   user_organisation_ids(), current_driver_id(uuid), current_employee_id(uuid)
-- RLS policy helpers (read-only; auth.uid() is null for anon).
do $$
declare
  r record;
  v_anon_rls_helpers text[] := array[
    'is_platform_owner',
    'is_org_member',
    'has_org_role',
    'has_org_role_names',
    'has_company_scope',
    'user_organisation_ids',
    'current_driver_id',
    'current_employee_id'
  ];
begin
  for r in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (v_anon_rls_helpers)
  loop
    execute format('grant execute on function public.%I(%s) to anon', r.proname, r.args);
  end loop;
end;
$$;

-- Auth signup trigger (SECURITY DEFINER); not a PostgREST RPC.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
      and p.prosecdef
  ) then
    revoke all on function public.handle_new_user() from public, anon, authenticated;
    grant execute on function public.handle_new_user() to postgres;
    if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
      grant execute on function public.handle_new_user() to supabase_auth_admin;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) compliance_scan_quota — backend-only (written by service_role RPC)
-- ---------------------------------------------------------------------------

alter table if exists public.compliance_scan_quota enable row level security;

-- No policies: direct PostgREST access denied; service_role bypasses RLS;
-- consume_compliance_scan_quota (SECURITY DEFINER, service_role) writes rows.

-- ---------------------------------------------------------------------------
-- 3) SECURITY INVOKER helpers — pin search_path (advisor function_search_path_mutable)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_invoker_pins text[] := array[
    'set_updated_at',
    'haversine_m',
    'staff_company_display_name',
    'calc_total_km',
    'service_week_bounds_sast',
    'compliance_immutable_driver_document',
    'compliance_immutable_vehicle_document',
    'storage_org_id',
    'storage_path_segment',
    'normalize_invoice_period_end',
    'invoice_period_lower_bound_sast',
    'invoice_period_upper_bound_sast'
  ];
begin
  for r in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not p.prosecdef
      and p.proname = any (v_invoker_pins)
  loop
    execute format(
      'alter function public.%I(%s) set search_path = pg_catalog, public',
      r.proname,
      r.args
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Default privileges — postgres-created app functions only
-- ---------------------------------------------------------------------------
-- Scope: Supabase app migrations connect as role postgres (not superuser).
-- Do not alter supabase_admin defaults (internal/extension objects).
-- Postgres grants EXECUTE to PUBLIC on every new function; per-schema ALTER
-- DEFAULT PRIVILEGES cannot remove PUBLIC — use global REVOKE (no IN SCHEMA).
-- Hosted postgres also has per-schema public defaults with anon=X — revoke those.

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;


-- 00055 internal RPC lockdown
do $$
declare
  r record;
  v_internal text[] := array[
    'assert_staff_trip_driver',
    'enqueue_driver_notification',
    'recalculate_invoice_totals',
    'resolve_invoice_bill_to_company_id',
    'resolve_pay_rate',
    'resolve_staff_company_id',
    'set_staff_trip_status',
    'sync_staff_trip_invoice_line'
  ];
begin
  for r in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (v_internal)
  loop
    execute format(
      'revoke all on function public.%I(%s) from public, anon, authenticated',
      r.proname,
      r.args
    );
    execute format(
      'grant execute on function public.%I(%s) to service_role',
      r.proname,
      r.args
    );
  end loop;
end;
$$;

-- Auth signup trigger — not a PostgREST RPC (00052); ensure service_role cannot invoke.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
  ) then
    revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
    grant execute on function public.handle_new_user() to postgres;
    if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
      grant execute on function public.handle_new_user() to supabase_auth_admin;
    end if;
  end if;
end;
$$;


COMMIT;
