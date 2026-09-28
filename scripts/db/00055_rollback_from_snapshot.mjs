#!/usr/bin/env node
/**
 * Generate SQL to restore 00055-affected grants, policies, and indexes from snapshot JSON.
 */
import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath) {
  console.error("Usage: node 00055_rollback_from_snapshot.mjs <snapshot.json> [rollback.sql]");
  process.exit(1);
}

const snap = JSON.parse(readFileSync(inPath, "utf8"));
const lines = ["-- Generated from 00055 snapshot", "BEGIN;"];

function fnIdent(regprocedure) {
  return regprocedure.startsWith("public.") ? regprocedure : `public.${regprocedure}`;
}

/** Indexes created by 00055 (rollback drops even if absent from pre-migration snapshot). */
const FKEY_INDEXES_00055 = [
  "admin_inbox_notifications_recipient_user_id_fkey_idx",
  "areas_created_by_fkey_idx",
  "attendance_events_qr_token_id_fkey_idx",
  "attendance_events_recorded_by_fkey_idx",
  "attendance_events_trip_id_fkey_idx",
  "audit_logs_actor_id_fkey_idx",
  "companies_created_by_fkey_idx",
  "compliance_alerts_sent_organisation_id_fkey_idx",
  "compliance_alerts_sent_recipient_user_id_fkey_idx",
  "compliance_scan_events_organisation_id_fkey_idx",
  "compliance_scan_temp_objects_organisation_id_fkey_idx",
  "driver_inbox_notifications_created_by_fkey_idx",
  "driver_inbox_notifications_driver_id_fkey_idx",
  "driver_inbox_notifications_trip_id_fkey_idx",
  "driver_no_trip_days_created_by_fkey_idx",
  "driver_no_trip_days_driver_id_fkey_idx",
  "drivers_created_by_fkey_idx",
  "employees_company_id_fkey_idx",
  "employees_created_by_fkey_idx",
  "employees_site_id_fkey_idx",
  "fuel_fillups_created_by_fkey_idx",
  "geofence_events_driver_id_fkey_idx",
  "geofence_events_geofence_id_fkey_idx",
  "geofences_created_by_fkey_idx",
  "geofences_pickup_point_id_fkey_idx",
  "geofences_site_id_fkey_idx",
  "gps_last_positions_driver_id_fkey_idx",
  "gps_last_positions_trip_id_fkey_idx",
  "gps_last_positions_vehicle_id_fkey_idx",
  "gps_points_vehicle_id_fkey_idx",
  "invitations_invited_by_fkey_idx",
  "invoice_lines_fuel_fillup_id_fkey_idx",
  "invoice_lines_organisation_id_fkey_idx",
  "invoice_lines_rate_card_id_fkey_idx",
  "invoice_lines_trip_company_id_fkey_idx",
  "invoices_company_id_fkey_idx",
  "invoices_generated_by_fkey_idx",
  "locations_created_by_fkey_idx",
  "member_scopes_created_by_fkey_idx",
  "notification_outbox_created_by_fkey_idx",
  "notification_outbox_organisation_id_fkey_idx",
  "organisation_members_created_by_fkey_idx",
  "organisations_created_by_fkey_idx",
  "pay_rates_company_id_fkey_idx",
  "pay_rates_created_by_fkey_idx",
  "payroll_lines_attendance_event_id_fkey_idx",
  "payroll_lines_organisation_id_fkey_idx",
  "payroll_lines_pay_rate_id_fkey_idx",
  "payroll_lines_trip_id_fkey_idx",
  "payroll_runs_generated_by_fkey_idx",
  "pickup_points_area_id_fkey_idx",
  "pickup_points_created_by_fkey_idx",
  "pickup_points_site_id_fkey_idx",
  "qr_tokens_issued_by_fkey_idx",
  "qr_tokens_trip_id_fkey_idx",
  "rate_cards_company_id_fkey_idx",
  "rate_cards_created_by_fkey_idx",
  "route_stops_organisation_id_fkey_idx",
  "route_stops_pickup_point_id_fkey_idx",
  "route_stops_site_id_fkey_idx",
  "routes_area_id_fkey_idx",
  "routes_created_by_fkey_idx",
  "schedules_created_by_fkey_idx",
  "sites_created_by_fkey_idx",
  "trip_assignments_assigned_by_fkey_idx",
  "trip_assignments_vehicle_id_fkey_idx",
  "trip_events_actor_id_fkey_idx",
  "trip_events_assignment_id_fkey_idx",
  "trip_passengers_created_by_fkey_idx",
  "trips_company_id_fkey_idx",
  "trips_created_by_fkey_idx",
  "vehicle_documents_created_by_fkey_idx",
  "vehicles_created_by_fkey_idx",
];

for (const name of [
  "driver_presence_insert",
  "driver_presence_update",
  "driver_presence_delete",
]) {
  lines.push(`DROP POLICY IF EXISTS ${name} ON public.driver_presence;`);
}

for (const fn of snap.internal_security_definer_functions ?? []) {
  const rp = fnIdent(fn.regprocedure);
  lines.push(`REVOKE ALL ON FUNCTION ${rp} FROM PUBLIC, anon, authenticated, service_role;`);
  if (fn.authenticated_execute) {
    lines.push(`GRANT EXECUTE ON FUNCTION ${rp} TO authenticated;`);
  }
  if (fn.service_role_execute) {
    lines.push(`GRANT EXECUTE ON FUNCTION ${rp} TO service_role;`);
  }
}

const hn = snap.handle_new_user_grants;
if (hn) {
  lines.push(
    `REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;`
  );
  lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;`);
  if (hn.supabase_auth_admin) {
    lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;`);
  } else if (hn.supabase_auth_admin === null) {
    lines.push(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin; END IF; END $$;`
    );
  }
  if (hn.authenticated) {
    lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;`);
  }
  if (hn.service_role) {
    lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;`);
  }
}

for (const p of snap.advisor_rls_policies ?? []) {
  lines.push(`DROP POLICY IF EXISTS ${p.policyname} ON public.${p.tablename};`);
  const roles =
    p.roles?.length && !(p.roles.length === 1 && p.roles[0] === "public")
      ? ` TO ${p.roles.join(", ")}`
      : "";
  const using = p.qual ? ` USING (${p.qual})` : "";
  const check = p.with_check ? ` WITH CHECK (${p.with_check})` : "";
  lines.push(
    `CREATE POLICY ${p.policyname} ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd}${roles}${using}${check};`
  );
}

for (const idx of new Set([...(snap.fkey_covering_indexes ?? []), ...FKEY_INDEXES_00055])) {
  lines.push(`DROP INDEX IF EXISTS public.${idx};`);
}

lines.push("COMMIT;");
lines.push("");

const sql = lines.join("\n");
if (outPath) {
  writeFileSync(outPath, sql);
} else {
  process.stdout.write(sql);
}
