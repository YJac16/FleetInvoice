/**
 * PostgREST client-callable public RPC names (app .rpc + auth helpers).
 * SECURITY DEFINER functions not listed here get EXECUTE only on service_role
 * (see migration 00060 section 3 and INTERNAL_SECURITY_DEFINER_RPCS).
 */

/** @type {readonly string[]} */
export const AUTHENTICATED_CLIENT_RPCS = [
  "accept_invitation",
  "check_invitation_email",
  "company_user_can_see",
  "compliance_storage_path_allowed",
  "assign_staff_trip",
  "assign_trip",
  "assign_vehicle_to_driver",
  "backfill_staff_waybill",
  "cancel_staff_trip",
  "cancel_trip_seat",
  "create_invitation",
  "current_driver_id",
  "current_employee_id",
  "declare_driver_no_trip_day",
  "driver_serves_company",
  "end_staff_trip",
  "enqueue_notification",
  "finalize_payroll_run",
  "generate_driver_weekly_invoice",
  "generate_payroll_run",
  "generate_period_invoice",
  "generate_trips",
  "generate_weekly_fuel_invoice",
  "get_invitation_by_token",
  "get_trip_driver_names",
  "has_company_scope",
  "has_org_role",
  "has_org_role_names",
  "heartbeat_driver_presence",
  "ingest_gps_points",
  "is_company_manager",
  "is_org_member",
  "is_platform_owner",
  "issue_qr_token",
  "list_compliance_missing_data",
  "list_compliance_renewals",
  "list_my_compliance",
  "log_fuel_fillup",
  "lookup_white_label",
  "mark_admin_notification_read",
  "mark_driver_notification_read",
  "org_entitled_modules",
  "record_manual_boarding",
  "request_trip_seat",
  "save_driver_self_contact",
  "scan_qr_token",
  "set_invoice_status",
  "staff_waybill_billing_readiness",
  "start_staff_trip",
  "advance_staff_trip_en_route",
  "transition_trip",
  "unassign_vehicle",
  "update_draft_invoice_line",
  "update_invoice_line_area",
  "update_my_employee_home",
  "update_staff_trip",
  "upsert_company_with_trip_rate",
  "user_organisation_ids",
  "vehicle_in_company_scope",
  "void_payroll_run",
];

/** @type {readonly string[]} */
export const ANON_CLIENT_RPCS = [
  "check_invitation_email",
  "get_invitation_by_token",
  "lookup_white_label",
];

/** RLS / storage policy helpers — anon must EXECUTE when policies reference them. */
/** @type {readonly string[]} */
export const ANON_RLS_DEFINER_HELPERS = [
  "compliance_storage_path_allowed",
  "current_driver_id",
  "current_employee_id",
  "has_company_scope",
  "has_org_role",
  "has_org_role_names",
  "is_org_member",
  "is_platform_owner",
  "user_organisation_ids",
];
