/**
 * Explicit trips column list for client selects.
 *
 * Migration 00079 revokes column SELECT on manual_unit_price and
 * manual_price_area_key from `authenticated`, so `select *` on trips would
 * fail with "permission denied". Add new trips columns here when they are
 * added to the table. Never add the two revoked price columns.
 */
export const TRIP_COLUMNS =
  "id, organisation_id, route_id, schedule_id, company_id, planned_start, planned_end, status, generation_key, notes, created_by, created_at, updated_at, deleted_at, service_locations, is_staff_transport, staff_company, area_text, pax_count, opening_km, closing_km, total_km, waybill_confirmed_at, staff_started_at, staff_completed_at, submitted_by_driver, approved_by, approved_at, rejected_reason, trip_company_id, priced_area_key, rate_effective_on, route_price_id, reprice_on_next_sync";
