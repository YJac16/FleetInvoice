import type { ComplianceRenewalRow } from "@/services/compliance.service";

export type InvoiceTotals = { count: number; total: number };
export type VehicleDue = { overdue: number; dueSoon: number };
export type DriverTripCount = { driverId: string; name: string; trips: number };

export type DashboardSummary = {
  /** Issued (unpaid) invoices. null when the viewer may not see money. */
  invoices: InvoiceTotals | null;
  /** Vehicle papers overdue / due soon. null when none or not permitted. */
  vehiclesDue: VehicleDue | null;
  /** Trips per driver this week. null when not permitted. */
  driverTrips: DriverTripCount[] | null;
};

export function sumIssuedInvoices(
  rows: Array<{ total: number | string | null }>
): InvoiceTotals {
  return {
    count: rows.length,
    total: rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0),
  };
}

export function summariseVehicleDue(rows: ComplianceRenewalRow[]): VehicleDue | null {
  let overdue = 0;
  let dueSoon = 0;
  for (const r of rows) {
    if (!r.subject_kind.startsWith("vehicle_")) continue;
    if (r.days_remaining < 0) overdue += 1;
    else dueSoon += 1;
  }
  return overdue + dueSoon === 0 ? null : { overdue, dueSoon };
}

type TripWithAssignments = {
  status: string;
  trip_assignments?: Array<{
    driver_id: string | null;
    released_at: string | null;
    drivers?: { full_name: string | null } | null;
  }> | null;
};

/** Trips per driver (active assignment only; cancelled trips ignored), busiest first. */
export function countTripsPerDriver(trips: TripWithAssignments[]): DriverTripCount[] {
  const byDriver = new Map<string, DriverTripCount>();
  for (const trip of trips) {
    if (trip.status === "cancelled") continue;
    const active = (trip.trip_assignments ?? []).find(
      (a) => !a.released_at && a.driver_id
    );
    if (!active?.driver_id) continue;
    const existing = byDriver.get(active.driver_id);
    if (existing) existing.trips += 1;
    else
      byDriver.set(active.driver_id, {
        driverId: active.driver_id,
        name: active.drivers?.full_name?.trim() || "Driver",
        trips: 1,
      });
  }
  return [...byDriver.values()].sort(
    (a, b) => b.trips - a.trips || a.name.localeCompare(b.name)
  );
}
