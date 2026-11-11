/**
 * Trip columns safe to return to any signed-in session.
 * `manual_unit_price` and `manual_price_area_key` are omitted. Migration
 * 00071 also revokes SELECT on those columns from the authenticated role so a
 * driver query cannot read them. Staff pricing continues inside security
 * definer functions.
 */
export const TRIP_ROW_COLUMNS = [
  "id",
  "organisation_id",
  "route_id",
  "schedule_id",
  "company_id",
  "planned_start",
  "planned_end",
  "status",
  "generation_key",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
  "deleted_at",
  "service_locations",
  "is_staff_transport",
  "staff_company",
  "area_text",
  "pax_count",
  "opening_km",
  "closing_km",
  "total_km",
  "waybill_confirmed_at",
  "staff_started_at",
  "staff_completed_at",
  "submitted_by_driver",
  "approved_by",
  "approved_at",
  "rejected_reason",
  "reprice_on_next_sync",
  "route_stops",
].join(", ");
