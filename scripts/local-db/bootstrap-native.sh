#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${WORKOPS_AUDIT_PG_PORT:-54322}"

if ! command -v psql >/dev/null; then
  echo "PostgreSQL client not found" >&2
  exit 1
fi

# Ensure cluster is running (Ubuntu package install).
if command -v pg_ctlcluster >/dev/null; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
fi

export PGHOST=127.0.0.1
export PGPORT="$PORT"

# Dedicated database for audit/compliance tests (does not touch system DBs).
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'workops_audit' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS workops_audit;
CREATE DATABASE workops_audit OWNER postgres;
SQL

# Listen on custom port via unix socket + port forwarding is awkward; use default 5432
# unless PGPORT is already configured. For cloud VM we use default 5432.
if [[ "$PORT" != "5432" ]]; then
  echo "Note: native bootstrap uses port 5432 (set WORKOPS_AUDIT_PG_PORT=5432)" >&2
  PORT=5432
  export PGPORT=5432
fi

echo "Applying auth stub..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/auth-stub.sql"

echo "Applying storage stub..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/storage-stub.sql"

sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE workops_audit SET search_path TO public, extensions, storage, auth;"

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "Applying $(basename "$f")..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$f"
done

if [[ -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql" ]]; then
  echo "Applying 00028..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql"
fi

echo "Seeding audit fixtures..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/seed-audit-fixtures.sql"

if [[ -f "$ROOT/scripts/local-db/seed-compliance-test-fixtures.sql" ]]; then
  echo "Seeding compliance test fixtures..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/seed-compliance-test-fixtures.sql"
fi

sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_rls') THEN
    CREATE ROLE audit_rls LOGIN PASSWORD 'audit_rls_test' NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO audit_rls;
    GRANT authenticated TO audit_rls;
  END IF;
  ALTER ROLE audit_rls WITH PASSWORD 'audit_rls_test';
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
  -- Service-role-only crons (migrations revoke these; bootstrap broad grant must not reopen)
  REVOKE EXECUTE ON FUNCTION public.enqueue_compliance_expiry_alerts() FROM PUBLIC, authenticated;
  REVOKE EXECUTE ON FUNCTION public.enqueue_compliance_renewals_digests(integer) FROM PUBLIC, authenticated;
  GRANT EXECUTE ON FUNCTION public.enqueue_compliance_expiry_alerts() TO service_role;
  GRANT EXECUTE ON FUNCTION public.enqueue_compliance_renewals_digests(integer) TO service_role;
  -- 00034 security definer RPCs (bootstrap broad grant must not reopen anon/public)
  REVOKE EXECUTE ON FUNCTION public.driver_serves_company(uuid, uuid, integer) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.driver_serves_company(uuid, uuid, integer) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.vehicle_in_company_scope(uuid, uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.vehicle_in_company_scope(uuid, uuid) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.assign_vehicle_to_driver(uuid, uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.assign_vehicle_to_driver(uuid, uuid) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.unassign_vehicle(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.unassign_vehicle(uuid) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.get_trip_driver_names(uuid[]) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_trip_driver_names(uuid[]) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.mark_admin_notification_read(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.mark_admin_notification_read(uuid) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.register_compliance_document(
    uuid, uuid, text, uuid, text, text, text, text, text, integer, text, text, text
  ) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.register_compliance_document(
    uuid, uuid, text, uuid, text, text, text, text, text, integer, text, text, text
  ) TO service_role;
  REVOKE EXECUTE ON FUNCTION public.soft_delete_compliance_document(uuid, uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.soft_delete_compliance_document(uuid, uuid, text, uuid)
    TO service_role;
  REVOKE EXECUTE ON FUNCTION public.consume_compliance_scan_quota(uuid, integer)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.consume_compliance_scan_quota(uuid, integer) TO service_role;
  REVOKE EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb, uuid)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) TO service_role;
  REVOKE EXECUTE ON FUNCTION public.save_driver_capture(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.save_vehicle_capture(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.save_driver_capture(uuid, uuid, uuid, jsonb) TO service_role;
  GRANT EXECUTE ON FUNCTION public.save_vehicle_capture(uuid, uuid, uuid, jsonb) TO service_role;
  REVOKE EXECUTE ON FUNCTION public.import_drivers_capture(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.import_vehicles_capture(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.import_drivers_capture(uuid, uuid, jsonb) TO service_role;
  GRANT EXECUTE ON FUNCTION public.import_vehicles_capture(uuid, uuid, jsonb) TO service_role;
  REVOKE EXECUTE ON FUNCTION public.soft_delete_driver(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.restore_driver(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.soft_delete_vehicle(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.restore_vehicle(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.soft_delete_driver(uuid, uuid, uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.restore_driver(uuid, uuid, uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.soft_delete_vehicle(uuid, uuid, uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.restore_vehicle(uuid, uuid, uuid) TO service_role;
  -- 00050 PR A function hardening (bootstrap broad grant must not reopen anon/public)
  REVOKE EXECUTE ON FUNCTION public.resolve_trip_line_rate(uuid, uuid, date)
    FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.sync_staff_trip_invoice_line(uuid, boolean) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.sync_staff_trip_invoice_line(uuid, boolean) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.update_staff_trip(
    uuid, timestamptz, uuid, public.staff_transport_company, text, int
  ) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.update_staff_trip(
    uuid, timestamptz, uuid, public.staff_transport_company, text, int
  ) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.assign_staff_trip(
    uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company
  ) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.assign_staff_trip(
    uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company
  ) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.backfill_staff_waybill(
    uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric
  ) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.backfill_staff_waybill(
    uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric
  ) TO authenticated;
  REVOKE EXECUTE ON FUNCTION public.upsert_company_with_trip_rate(
    uuid, text, uuid, text, text, text, text, text, public.entity_status, numeric, date, text, text
  ) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.upsert_company_with_trip_rate(
    uuid, text, uuid, text, text, text, text, text, public.entity_status, numeric, date, text, text
  ) TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_documents TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_orphan_objects TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_scan_events TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_scan_temp_objects TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_scan_quota TO service_role;
  GRANT SELECT, INSERT, UPDATE ON public.compliance_storage_purge_queue TO service_role;
  -- 00052 fuel slips: all writes via service-role RPCs (bootstrap broad grant must not reopen)
  IF to_regclass('public.fuel_slip_photos') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fuel_fillups, public.fuel_slip_photos,
      public.fuel_entry_flags, public.fuel_settings FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.fuel_fillups, public.fuel_slip_photos,
      public.fuel_entry_flags, public.fuel_settings TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_fillups, public.fuel_slip_photos,
      public.fuel_entry_flags, public.fuel_settings TO service_role;
    DECLARE
      fn regprocedure;
    BEGIN
      FOR fn IN
        SELECT p.oid::regprocedure FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND (p.proname LIKE 'fuel\_%' OR p.proname IN (
            'submit_fuel_slip', 'update_fuel_slip', 'replace_fuel_slip_photo', 'review_fuel_slip',
            'void_fuel_slip', 'privacy_purge_fuel_slip_photo', 'audit_fuel_slip_photo_view',
            'audit_fuel_report_export', 'save_fuel_settings', 'run_fuel_slip_retention',
            'evaluate_fuel_entry_flags', 'log_fuel_fillup'))
      LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      END LOOP;
    END;
  END IF;
END $$;
SQL

echo "Native audit DB ready: db=workops_audit host=127.0.0.1 port=${PORT}"
