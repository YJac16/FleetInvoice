-- =============================================================================
-- 00060 — Supabase audit hardening (13 Oct)
-- =============================================================================
-- Defence-in-depth: invitation preview surface, org-scoped helpers, RPC grants,
-- staff/employee RPC ownership checks, storage listing, compliance tables, anon ACLs.
-- Does not apply to production from this branch alone (migration file only).

-- ---------------------------------------------------------------------------
-- 1) get_invitation_by_token — minimal preview (no ids/token)
-- ---------------------------------------------------------------------------

drop function if exists public.get_invitation_by_token(text);

create or replace function public.get_invitation_by_token(p_token text)
returns table (
  org_name text,
  role public.app_role,
  email text,
  expires_at timestamptz,
  status public.invitation_status
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inv public.invitations%rowtype;
  v_org_name text;
  v_local text;
  v_domain text;
  v_masked text;
begin
  select i.*
  into inv
  from public.invitations i
  where i.token = p_token
    and i.status = 'pending'
    and i.deleted_at is null
    and i.expires_at > timezone('utc', now());

  if not found then
    return;
  end if;

  select o.name
  into v_org_name
  from public.organisations o
  where o.id = inv.organisation_id
    and o.deleted_at is null;

  v_local := split_part(inv.email, '@', 1);
  v_domain := split_part(inv.email, '@', 2);
  if v_domain = '' then
    v_masked := '***';
  elsif length(v_local) <= 1 then
    v_masked := '*@' || v_domain;
  else
    v_masked := left(v_local, 1) || repeat('*', greatest(1, length(v_local) - 1)) || '@' || v_domain;
  end if;

  org_name := coalesce(v_org_name, 'Organisation');
  role := inv.role;
  email := v_masked;
  expires_at := inv.expires_at;
  status := inv.status;
  return next;
end;
$$;

revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

create or replace function public.check_invitation_email(p_token text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invite_email text;
begin
  select lower(trim(i.email))
  into v_invite_email
  from public.invitations i
  where i.token = p_token
    and i.status = 'pending'
    and i.deleted_at is null
    and i.expires_at > timezone('utc', now());

  if v_invite_email is null then
    return false;
  end if;

  return v_invite_email = lower(trim(p_email));
end;
$$;

revoke all on function public.check_invitation_email(text, text) from public;
grant execute on function public.check_invitation_email(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Org membership guards on scope helpers
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
set search_path = pg_catalog, public
as $$
  select (
    public.is_platform_owner()
    or public.is_org_member(p_organisation_id)
  )
  and (
    exists (
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
    )
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
set search_path = pg_catalog, public
as $$
  select (
    public.is_platform_owner()
    or public.is_org_member(p_organisation_id)
  )
  and exists (
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
set search_path = pg_catalog, public
as $$
  select case
    when public.is_platform_owner() or public.is_org_member(p_organisation_id) then
      coalesce(
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
      )
    else
      array[]::text[]
  end;
$$;

revoke all on function public.driver_serves_company(uuid, uuid, integer) from public, anon;
grant execute on function public.driver_serves_company(uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.vehicle_in_company_scope(uuid, uuid) from public, anon;
grant execute on function public.vehicle_in_company_scope(uuid, uuid) to authenticated, service_role;

revoke all on function public.org_entitled_modules(uuid) from public, anon;
grant execute on function public.org_entitled_modules(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) SECURITY DEFINER EXECUTE — explicit client allow-list (see scripts/db/00060-client-rpc-allowlist.mjs)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_args text;
  v_authenticated_client text[] := array[
    'accept_invitation', 'assign_staff_trip', 'assign_trip', 'assign_vehicle_to_driver',
    'backfill_staff_waybill', 'cancel_staff_trip', 'cancel_trip_seat', 'check_invitation_email',
    'company_user_can_see', 'compliance_storage_path_allowed', 'create_invitation',
    'current_driver_id', 'current_employee_id', 'declare_driver_no_trip_day', 'driver_serves_company',
    'end_staff_trip', 'enqueue_notification', 'finalize_payroll_run', 'generate_driver_weekly_invoice',
    'generate_payroll_run', 'generate_period_invoice', 'generate_trips', 'generate_weekly_fuel_invoice',
    'get_invitation_by_token', 'get_trip_driver_names', 'has_company_scope', 'has_org_role',
    'has_org_role_names', 'heartbeat_driver_presence', 'ingest_gps_points', 'is_company_manager',
    'is_org_member', 'is_platform_owner', 'issue_qr_token', 'list_compliance_missing_data',
    'list_compliance_renewals', 'list_my_compliance', 'log_fuel_fillup', 'lookup_white_label',
    'mark_admin_notification_read', 'mark_driver_notification_read', 'org_entitled_modules',
    'record_manual_boarding', 'request_trip_seat', 'save_driver_self_contact', 'scan_qr_token',
    'set_invoice_status', 'staff_waybill_billing_readiness', 'start_staff_trip',
    'advance_staff_trip_en_route', 'transition_trip', 'unassign_vehicle', 'update_draft_invoice_line',
    'update_invoice_line_area', 'update_my_employee_home', 'update_staff_trip',
    'upsert_company_with_trip_rate', 'user_organisation_ids', 'vehicle_in_company_scope', 'void_payroll_run'
  ];
  v_anon_client text[] := array[
    'check_invitation_email', 'get_invitation_by_token', 'lookup_white_label'
  ];
  v_anon_rls_helpers text[] := array[
    'is_platform_owner', 'is_org_member', 'has_org_role', 'has_org_role_names',
    'has_company_scope', 'user_organisation_ids', 'current_driver_id', 'current_employee_id',
    'compliance_storage_path_allowed'
  ];
  v_service_only text[] := array[
    'audit_compliance_document_view', 'compliance_register_actor_ok', 'consume_compliance_scan_quota',
    'enqueue_compliance_expiry_alerts', 'enqueue_compliance_renewals_digests', 'enqueue_compliance_storage_purge',
    'import_drivers_capture', 'import_vehicles_capture', 'purge_compliance_document_storage',
    'register_compliance_document', 'resolve_trip_line_rate', 'restore_driver', 'restore_vehicle',
    'run_compliance_document_retention', 'save_driver_capture', 'save_vehicle_capture',
    'soft_delete_compliance_document', 'soft_delete_driver', 'soft_delete_vehicle',
    'trim_superseded_compliance_versions', 'write_audit_log'
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
  loop
    v_args := r.args;
    execute format(
      'revoke all on function public.%I(%s) from public, anon, authenticated',
      r.proname,
      v_args
    );

    if r.proname = 'handle_new_user' then
      grant execute on function public.handle_new_user() to postgres;
      if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
        grant execute on function public.handle_new_user() to supabase_auth_admin;
      end if;
      continue;
    end if;

    execute format(
      'grant execute on function public.%I(%s) to service_role',
      r.proname,
      v_args
    );

    if r.proname = any (v_service_only) then
      continue;
    end if;

    if r.proname = any (v_authenticated_client) then
      execute format(
        'grant execute on function public.%I(%s) to authenticated',
        r.proname,
        v_args
      );
    end if;

    if r.proname = any (v_anon_client) or r.proname = any (v_anon_rls_helpers) then
      execute format('grant execute on function public.%I(%s) to anon', r.proname, v_args);
    end if;
  end loop;
end;
$$;

-- Grant EXECUTE to authenticated for every SECURITY DEFINER function referenced in RLS
-- (public + storage.objects). Excludes internal helpers that must stay service_role-only.
do $$
declare
  r record;
  v_rls_exclude text[] := array[
    'driver_default_vehicle_id',
    'ensure_trip_assignment_vehicle',
    'guard_company_manager_member_scope',
    'handle_new_user'
  ];
begin
  for r in
    with policy_text as (
      select coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
      from pg_policies
      where schemaname in ('public', 'storage')
    ),
    fn_names as (
      select distinct (m)[1] as proname
      from policy_text pt,
        lateral regexp_matches(pt.expr, '(?:public\.)?([a-z_][a-z0-9_]*)\s*\(', 'gi') as m
    )
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from fn_names f
    join pg_proc p on p.proname = f.proname
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prosecdef
      and not (f.proname = any (v_rls_exclude))
  loop
    execute format(
      'grant execute on function public.%I(%s) to authenticated',
      r.proname,
      r.args
    );
  end loop;

  for r in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (v_rls_exclude)
      and p.proname <> 'handle_new_user'
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

-- ---------------------------------------------------------------------------
-- 4) Explicit org / ownership checks on staff + employee RPCs
-- ---------------------------------------------------------------------------

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

create or replace function public.update_my_employee_home(
  p_organisation_id uuid,
  p_home_address text default null,
  p_home_latitude double precision default null,
  p_home_longitude double precision default null
)
returns public.employees
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  emp_id uuid;
  emp public.employees%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_org_member(p_organisation_id)
  ) then
    raise exception 'Not authorised';
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
set search_path = pg_catalog, public
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

  if not (
    public.is_platform_owner()
    or public.is_org_member(p_organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

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
set search_path = pg_catalog, public
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

  if not (
    public.is_platform_owner()
    or public.is_org_member(p_organisation_id)
  ) then
    raise exception 'Not authorised';
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

-- ---------------------------------------------------------------------------
-- 5) Storage — no bucket-wide listing; public URLs unchanged (bucket public flag)
-- ---------------------------------------------------------------------------

drop policy if exists avatars_select on storage.objects;

drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists org_logos_select on storage.objects;
create policy org_logos_select on storage.objects
  for select
  using (
    bucket_id = 'org-logos'
    and (
      public.is_platform_owner()
      or public.has_org_role(
        (storage.foldername(name))[1]::uuid,
        array['organisation_admin']::public.app_role[]
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Compliance backend tables — no direct PostgREST client access
-- ---------------------------------------------------------------------------
-- Rows are written by service_role SECURITY DEFINER jobs only; RLS has no
-- permissive policies for these tables.

revoke all on table public.compliance_alerts_sent from anon, authenticated;
revoke all on table public.compliance_orphan_objects from anon, authenticated;
revoke all on table public.compliance_scan_quota from anon, authenticated;
revoke all on table public.compliance_scan_temp_objects from anon, authenticated;
revoke all on table public.compliance_storage_purge_queue from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Anon table privileges — pre-login flows use RPCs only
-- ---------------------------------------------------------------------------
-- lookup_white_label(text) and get_invitation_by_token(text) are SECURITY
-- DEFINER; invite and middleware do not require anon SELECT on public tables.

do $$
declare
  r record;
begin
  for r in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('revoke all on table public.%I from anon', r.tablename);
  end loop;
end;
$$;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres
  revoke all on tables from anon;
