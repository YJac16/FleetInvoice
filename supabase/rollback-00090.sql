-- =============================================================================
-- ROLLBACK: 00090_demo_jacobs_source_orgs_seed.sql
-- =============================================================================
-- Manual script. Deletes the fake Demo Yaseen Org / Demo Fadia Org and their
-- five @example.com logins. Run supabase/rollback-jacobs-org-copy.sql first.
-- Touches nothing else (Cape Shuttle Ops untouched).
-- =============================================================================

begin;

-- pg_temp helper: deletes every row of one org, children first, then the org.
-- Guard triggers that block deletes (trip_audit append-only, final workshop
-- bill lock) are disabled for this transaction only by the caller.
create or replace function pg_temp.purge_org(p_org uuid)
returns void
language plpgsql
as $fn$
declare
  t text;
  ordered text[] := array[
    'audit_logs', 'admin_inbox_notifications', 'driver_inbox_notifications', 'notification_outbox',
    'compliance_alerts_sent', 'compliance_scan_events', 'compliance_scan_temp_objects',
    'compliance_storage_purge_queue', 'compliance_scan_quota',
    'workshop_bill_lines', 'workshop_bills', 'suppliers', 'maintenance_categories',
    'invoice_lines', 'invoices', 'payroll_lines', 'payroll_runs', 'fuel_fillups',
    'attendance_events', 'qr_tokens', 'trip_driver_submission_snapshots', 'trip_billing_overrides',
    'trip_audit', 'trip_passengers', 'trip_events', 'gps_last_positions', 'gps_points',
    'geofence_events', 'trip_assignments', 'trips', 'pay_rates', 'route_prices', 'rate_cards',
    'member_scopes', 'vehicle_documents', 'driver_documents', 'driver_no_trip_days', 'driver_presence',
    'driver_invoice_print_overrides', 'driver_vehicle_assignments', 'geofences', 'vehicles', 'drivers',
    'employees', 'schedules', 'route_stops', 'routes', 'locations', 'pickup_points', 'sites', 'areas',
    'companies', 'invitations', 'white_label_configs', 'organisation_members', 'subscriptions'
  ];
  rest text[];
  pass int;
begin
  foreach t in array ordered loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where organisation_id = $1', t) using p_org;
    end if;
  end loop;

  -- Any other org-scoped table (rows written after the copy).
  select coalesce(array_agg(c.relname::text), '{}') into rest
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname::text <> all (ordered)
    and c.relname <> 'org_copy_map';
  for pass in 1..5 loop
    foreach t in array rest loop
      begin
        execute format('delete from public.%I where organisation_id = $1', t) using p_org;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
  end loop;

  delete from public.organisations where id = p_org;
end;
$fn$;

do $tg$
begin
  if to_regclass('public.trip_audit') is not null then
    alter table public.trip_audit disable trigger trip_audit_no_delete;
  end if;
  if to_regclass('public.workshop_bills') is not null then
    alter table public.workshop_bills disable trigger workshop_bills_final_lock;
    alter table public.workshop_bill_lines disable trigger workshop_bill_lines_final_lock;
  end if;
end;
$tg$;

do $rb$
begin
  if exists (
    select 1 from public.org_copy_map m
    where m.source_table = 'organisations'
      and m.source_org_id in ('5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000002')
  ) then
    raise exception 'rollback-00090: Jacobs Org copy still present; run rollback-jacobs-org-copy.sql first';
  end if;
  perform pg_temp.purge_org('5eed0000-0000-4000-8000-000000000001');
  perform pg_temp.purge_org('5eed0000-0000-4000-8000-000000000002');
  delete from public.profiles where id in (
    '5eed0000-0000-4000-8000-000000000101', '5eed0000-0000-4000-8000-000000000102',
    '5eed0000-0000-4000-8000-000000000103', '5eed0000-0000-4000-8000-000000000104',
    '5eed0000-0000-4000-8000-000000000105'
  );
  delete from auth.users where id in (
    '5eed0000-0000-4000-8000-000000000101', '5eed0000-0000-4000-8000-000000000102',
    '5eed0000-0000-4000-8000-000000000103', '5eed0000-0000-4000-8000-000000000104',
    '5eed0000-0000-4000-8000-000000000105'
  );
end;
$rb$;

do $tg$
begin
  if to_regclass('public.trip_audit') is not null then
    alter table public.trip_audit enable trigger trip_audit_no_delete;
  end if;
  if to_regclass('public.workshop_bills') is not null then
    alter table public.workshop_bills enable trigger workshop_bills_final_lock;
    alter table public.workshop_bill_lines enable trigger workshop_bill_lines_final_lock;
  end if;
end;
$tg$;

commit;
