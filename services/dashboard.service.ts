import {
  countTripsPerDriver,
  sumIssuedInvoices,
  summariseVehicleDue,
  type DashboardSummary,
} from "@/features/dashboard/lib/summary";
import { mondayOfWeek, weekPeriodEnd } from "@/features/invoices/lib/week";
import { createClient } from "@/lib/supabase/client";
import { listComplianceRenewals } from "@/services/compliance.service";
import type { DashboardCounts, DashboardOpsSummary } from "@/types";

async function countRows(
  table: string,
  organisationId: string,
  column = "id"
): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardCounts(
  organisationId: string
): Promise<DashboardCounts> {
  const [
    drivers,
    employees,
    vehicles,
    companies,
    sites,
    pickup_points,
    users,
  ] = await Promise.all([
    countRows("drivers", organisationId),
    countRows("employees", organisationId),
    countRows("vehicles", organisationId),
    countRows("companies", organisationId),
    countRows("sites", organisationId),
    countRows("pickup_points", organisationId),
    countRows("organisation_members", organisationId),
  ]);

  return {
    drivers,
    employees,
    vehicles,
    companies,
    sites,
    pickup_points,
    users,
  };
}

export async function getDashboardOpsSummary(
  organisationId: string,
  fromInclusive: string,
  toExclusive: string
): Promise<DashboardOpsSummary> {
  const supabase = createClient();
  const rangeStart = `${fromInclusive}T00:00:00+02:00`;
  const rangeEnd = `${toExclusive}T00:00:00+02:00`;

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, status, trip_assignments(id, released_at)"
    )
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .gte("planned_start", rangeStart)
    .lt("planned_start", rangeEnd);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    trip_assignments?: Array<{ id: string; released_at: string | null }> | null;
  }>;

  let today_planned = 0;
  let today_assigned = 0;
  let today_in_progress = 0;
  let today_completed = 0;
  let unassigned = 0;

  for (const trip of rows) {
    if (trip.status === "planned") today_planned += 1;
    if (trip.status === "assigned") today_assigned += 1;
    if (trip.status === "in_progress") today_in_progress += 1;
    if (trip.status === "completed") today_completed += 1;

    const hasActiveAssignment = (trip.trip_assignments ?? []).some(
      (a) => !a.released_at
    );
    if (
      (trip.status === "planned" || trip.status === "assigned") &&
      !hasActiveAssignment
    ) {
      unassigned += 1;
    }
  }

  return {
    today_planned,
    today_assigned,
    today_in_progress,
    today_completed,
    unassigned,
  };
}

export type DashboardSummaryAccess = {
  /** invoices:view: the only gate for money. Drivers never have it. */
  invoices: boolean;
  vehicles: boolean;
  trips: boolean;
};

/**
 * Morning summary. Only runs the queries the viewer is allowed to see; every
 * query is scoped to the organisation. Never reads invoices without `access.invoices`.
 */
export async function getDashboardSummary(
  organisationId: string,
  access: DashboardSummaryAccess,
  now: Date = new Date()
): Promise<DashboardSummary> {
  const supabase = createClient();

  const invoices = access.invoices
    ? (async () => {
        const { data, error } = await supabase
          .from("invoices")
          .select("total")
          .eq("organisation_id", organisationId)
          .eq("status", "issued")
          .is("deleted_at", null);
        if (error) throw error;
        return sumIssuedInvoices(data ?? []);
      })()
    : Promise.resolve(null);

  const vehiclesDue = access.vehicles
    ? listComplianceRenewals(organisationId, 30).then(summariseVehicleDue)
    : Promise.resolve(null);

  const driverTrips = access.trips
    ? (async () => {
        const monday = mondayOfWeek(now);
        const nextMonday = new Date(`${weekPeriodEnd(monday)}T00:00:00+02:00`);
        nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
        const { data, error } = await supabase
          .from("trips")
          .select(
            "status, trip_assignments(driver_id, released_at, drivers:driver_id (full_name))"
          )
          .eq("organisation_id", organisationId)
          .is("deleted_at", null)
          .gte("planned_start", `${monday}T00:00:00+02:00`)
          .lt("planned_start", nextMonday.toISOString());
        if (error) throw error;
        return countTripsPerDriver(
          (data ?? []) as Parameters<typeof countTripsPerDriver>[0]
        );
      })()
    : Promise.resolve(null);

  const [inv, veh, trips] = await Promise.all([invoices, vehiclesDue, driverTrips]);
  return { invoices: inv, vehiclesDue: veh, driverTrips: trips };
}
