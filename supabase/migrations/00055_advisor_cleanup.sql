-- =============================================================================
-- 00055 — Supabase advisor cleanup (performance + security), idempotent
-- =============================================================================
-- PERFORMANCE: FK covering indexes, auth_rls_initplan fixes, driver_presence
--              policy split (remove duplicate permissive SELECT).
-- SECURITY: revoke authenticated EXECUTE on internal SECURITY DEFINER helpers;
--           tighten handle_new_user grants; postgres default privileges (tables/sequences).

-- ---------------------------------------------------------------------------
-- 1) Internal SECURITY DEFINER RPCs — service_role / definer callers only
-- ---------------------------------------------------------------------------
-- Not exposed via app .rpc(); still callable from other SECURITY DEFINER RPCs.

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

-- ---------------------------------------------------------------------------
-- 2) Default privileges — postgres-created public tables/sequences (no anon)
-- ---------------------------------------------------------------------------

alter default privileges for role postgres revoke all on tables from anon;
alter default privileges for role postgres revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- 3) auth_rls_initplan — wrap auth.uid() in scalar subselect (same semantics)
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  using (
    public.is_platform_owner()
    or id = (select auth.uid())
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  using (id = (select auth.uid()) or public.is_platform_owner())
  with check (id = (select auth.uid()) or public.is_platform_owner());

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or profile_id = (select auth.uid())
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

drop policy if exists admin_inbox_select on public.admin_inbox_notifications;
create policy admin_inbox_select on public.admin_inbox_notifications
  for select
  using (
    recipient_user_id = (select auth.uid())
    and organisation_id in (select public.user_organisation_ids())
  );

drop policy if exists admin_inbox_update on public.admin_inbox_notifications;
create policy admin_inbox_update on public.admin_inbox_notifications
  for update
  using (
    recipient_user_id = (select auth.uid())
    and organisation_id in (select public.user_organisation_ids())
  )
  with check (
    recipient_user_id = (select auth.uid())
    and organisation_id in (select public.user_organisation_ids())
  );

-- ---------------------------------------------------------------------------
-- 4) multiple_permissive_policies — driver_presence (split FOR ALL upsert)
-- ---------------------------------------------------------------------------

drop policy if exists driver_presence_upsert on public.driver_presence;

drop policy if exists driver_presence_insert on public.driver_presence;
create policy driver_presence_insert on public.driver_presence
  for insert
  with check (driver_id = public.current_driver_id(organisation_id));

drop policy if exists driver_presence_update on public.driver_presence;
create policy driver_presence_update on public.driver_presence
  for update
  using (driver_id = public.current_driver_id(organisation_id))
  with check (driver_id = public.current_driver_id(organisation_id));

drop policy if exists driver_presence_delete on public.driver_presence;
create policy driver_presence_delete on public.driver_presence
  for delete
  using (driver_id = public.current_driver_id(organisation_id));

-- ---------------------------------------------------------------------------
-- 5) unindexed_foreign_keys — covering indexes (Supabase splinter 0001)
-- ---------------------------------------------------------------------------

create index if not exists admin_inbox_notifications_recipient_user_id_fkey_idx on public.admin_inbox_notifications (recipient_user_id);
create index if not exists areas_created_by_fkey_idx on public.areas (created_by);
create index if not exists attendance_events_qr_token_id_fkey_idx on public.attendance_events (qr_token_id);
create index if not exists attendance_events_recorded_by_fkey_idx on public.attendance_events (recorded_by);
create index if not exists attendance_events_trip_id_fkey_idx on public.attendance_events (trip_id);
create index if not exists audit_logs_actor_id_fkey_idx on public.audit_logs (actor_id);
create index if not exists companies_created_by_fkey_idx on public.companies (created_by);
create index if not exists compliance_alerts_sent_organisation_id_fkey_idx on public.compliance_alerts_sent (organisation_id);
create index if not exists compliance_alerts_sent_recipient_user_id_fkey_idx on public.compliance_alerts_sent (recipient_user_id);
create index if not exists compliance_scan_events_organisation_id_fkey_idx on public.compliance_scan_events (organisation_id);
create index if not exists compliance_scan_temp_objects_organisation_id_fkey_idx on public.compliance_scan_temp_objects (organisation_id);
create index if not exists driver_inbox_notifications_created_by_fkey_idx on public.driver_inbox_notifications (created_by);
create index if not exists driver_inbox_notifications_driver_id_fkey_idx on public.driver_inbox_notifications (driver_id);
create index if not exists driver_inbox_notifications_trip_id_fkey_idx on public.driver_inbox_notifications (trip_id);
create index if not exists driver_no_trip_days_created_by_fkey_idx on public.driver_no_trip_days (created_by);
create index if not exists driver_no_trip_days_driver_id_fkey_idx on public.driver_no_trip_days (driver_id);
create index if not exists drivers_created_by_fkey_idx on public.drivers (created_by);
create index if not exists employees_company_id_fkey_idx on public.employees (company_id);
create index if not exists employees_created_by_fkey_idx on public.employees (created_by);
create index if not exists employees_site_id_fkey_idx on public.employees (site_id);
create index if not exists fuel_fillups_created_by_fkey_idx on public.fuel_fillups (created_by);
create index if not exists geofence_events_driver_id_fkey_idx on public.geofence_events (driver_id);
create index if not exists geofence_events_geofence_id_fkey_idx on public.geofence_events (geofence_id);
create index if not exists geofences_created_by_fkey_idx on public.geofences (created_by);
create index if not exists geofences_pickup_point_id_fkey_idx on public.geofences (pickup_point_id);
create index if not exists geofences_site_id_fkey_idx on public.geofences (site_id);
create index if not exists gps_last_positions_driver_id_fkey_idx on public.gps_last_positions (driver_id);
create index if not exists gps_last_positions_trip_id_fkey_idx on public.gps_last_positions (trip_id);
create index if not exists gps_last_positions_vehicle_id_fkey_idx on public.gps_last_positions (vehicle_id);
create index if not exists gps_points_vehicle_id_fkey_idx on public.gps_points (vehicle_id);
create index if not exists invitations_invited_by_fkey_idx on public.invitations (invited_by);
create index if not exists invoice_lines_fuel_fillup_id_fkey_idx on public.invoice_lines (fuel_fillup_id);
create index if not exists invoice_lines_organisation_id_fkey_idx on public.invoice_lines (organisation_id);
create index if not exists invoice_lines_rate_card_id_fkey_idx on public.invoice_lines (rate_card_id);
create index if not exists invoice_lines_trip_company_id_fkey_idx on public.invoice_lines (trip_company_id);
create index if not exists invoices_company_id_fkey_idx on public.invoices (company_id);
create index if not exists invoices_generated_by_fkey_idx on public.invoices (generated_by);
create index if not exists locations_created_by_fkey_idx on public.locations (created_by);
create index if not exists member_scopes_created_by_fkey_idx on public.member_scopes (created_by);
create index if not exists notification_outbox_created_by_fkey_idx on public.notification_outbox (created_by);
create index if not exists notification_outbox_organisation_id_fkey_idx on public.notification_outbox (organisation_id);
create index if not exists organisation_members_created_by_fkey_idx on public.organisation_members (created_by);
create index if not exists organisations_created_by_fkey_idx on public.organisations (created_by);
create index if not exists pay_rates_company_id_fkey_idx on public.pay_rates (company_id);
create index if not exists pay_rates_created_by_fkey_idx on public.pay_rates (created_by);
create index if not exists payroll_lines_attendance_event_id_fkey_idx on public.payroll_lines (attendance_event_id);
create index if not exists payroll_lines_organisation_id_fkey_idx on public.payroll_lines (organisation_id);
create index if not exists payroll_lines_pay_rate_id_fkey_idx on public.payroll_lines (pay_rate_id);
create index if not exists payroll_lines_trip_id_fkey_idx on public.payroll_lines (trip_id);
create index if not exists payroll_runs_generated_by_fkey_idx on public.payroll_runs (generated_by);
create index if not exists pickup_points_area_id_fkey_idx on public.pickup_points (area_id);
create index if not exists pickup_points_created_by_fkey_idx on public.pickup_points (created_by);
create index if not exists pickup_points_site_id_fkey_idx on public.pickup_points (site_id);
create index if not exists qr_tokens_issued_by_fkey_idx on public.qr_tokens (issued_by);
create index if not exists qr_tokens_trip_id_fkey_idx on public.qr_tokens (trip_id);
create index if not exists rate_cards_company_id_fkey_idx on public.rate_cards (company_id);
create index if not exists rate_cards_created_by_fkey_idx on public.rate_cards (created_by);
create index if not exists route_stops_organisation_id_fkey_idx on public.route_stops (organisation_id);
create index if not exists route_stops_pickup_point_id_fkey_idx on public.route_stops (pickup_point_id);
create index if not exists route_stops_site_id_fkey_idx on public.route_stops (site_id);
create index if not exists routes_area_id_fkey_idx on public.routes (area_id);
create index if not exists routes_created_by_fkey_idx on public.routes (created_by);
create index if not exists schedules_created_by_fkey_idx on public.schedules (created_by);
create index if not exists sites_created_by_fkey_idx on public.sites (created_by);
create index if not exists trip_assignments_assigned_by_fkey_idx on public.trip_assignments (assigned_by);
create index if not exists trip_assignments_vehicle_id_fkey_idx on public.trip_assignments (vehicle_id);
create index if not exists trip_events_actor_id_fkey_idx on public.trip_events (actor_id);
create index if not exists trip_events_assignment_id_fkey_idx on public.trip_events (assignment_id);
create index if not exists trip_passengers_created_by_fkey_idx on public.trip_passengers (created_by);
create index if not exists trips_company_id_fkey_idx on public.trips (company_id);
create index if not exists trips_created_by_fkey_idx on public.trips (created_by);
create index if not exists vehicle_documents_created_by_fkey_idx on public.vehicle_documents (created_by);
create index if not exists vehicles_created_by_fkey_idx on public.vehicles (created_by);
