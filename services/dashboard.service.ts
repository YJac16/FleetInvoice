import { createClient } from "@/lib/supabase/client";
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

function dayBoundsIso(): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getDashboardOpsSummary(
  organisationId: string
): Promise<DashboardOpsSummary> {
  const supabase = createClient();
  const { start, end } = dayBoundsIso();

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, status, trip_assignments(id, released_at)"
    )
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .gte("planned_start", start)
    .lte("planned_start", end);
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
