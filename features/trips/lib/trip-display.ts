import {
  STAFF_TRANSPORT_COMPANY_LABELS,
  type StaffTransportCompany,
} from "@/lib/constants";

type TripDisplayFields = {
  is_staff_transport?: boolean | null;
  area_text?: string | null;
  service_locations?: string | null;
  staff_company?: StaffTransportCompany | string | null;
  routes?: { name?: string | null } | null;
  companies?: { name?: string | null } | null;
};

/**
 * Company shown for a staff waybill. New waybills store `company_id` (joined as
 * `companies.name`); legacy rows only have the `staff_company` enum.
 */
export function tripCompanyLabel(trip: TripDisplayFields): string | null {
  const joined = trip.companies?.name?.trim();
  if (joined) return joined;
  if (trip.staff_company) {
    return (
      STAFF_TRANSPORT_COMPANY_LABELS[trip.staff_company as StaffTransportCompany] ??
      String(trip.staff_company)
    );
  }
  return null;
}

/**
 * Trips list "Route" column. Scheduled trips show their route; staff waybills
 * have no route, so show "Staff waybill · <company>".
 */
export function tripRouteLabel(trip: TripDisplayFields): string {
  const route = trip.routes?.name?.trim();
  if (route) return route;
  if (trip.is_staff_transport) {
    const company = tripCompanyLabel(trip);
    return company ? `Staff waybill · ${company}` : "Staff waybill";
  }
  return "—";
}

/**
 * Trips list "AREA" column. Waybills created via Create waybill store the area
 * in `area_text`; scheduled trips use `service_locations` (falling back to the route name).
 */
export function tripAreaLabel(trip: TripDisplayFields): string {
  return (
    trip.service_locations?.trim() ||
    trip.area_text?.trim() ||
    trip.routes?.name?.trim() ||
    "—"
  );
}
