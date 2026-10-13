import type { ResolvedDateRange } from "@/lib/date-range/sast-range";
import { plannedStartBoundsForRange } from "@/lib/date-range/supabase-bounds";
import { createClient } from "@/lib/supabase/client";
import {
  getTripDriverNames,
  mergeTripDriverNames,
} from "@/services/trip-driver-names.service";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { TripEventType } from "@/lib/constants";
import type { Trip } from "@/types";

const TABLE = "trips";

const TRIP_SELECT =
  "*, routes:route_id (name), companies:company_id (name), trip_assignments(id, driver_id, vehicle_id, released_at, vehicles:vehicle_id (name, registration_number, capacity))";

export type ListTripsOptions = ListTenantOptions & {
  dateRange?: ResolvedDateRange;
};

/** Cheap existence check (no date filter) for empty-state copy on the trips list. */
export async function orgHasAnyTrips(organisationId: string): Promise<boolean> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function listTripRows(
  organisationId: string,
  options?: ListTripsOptions
) {
  const { dateRange, ...listOptions } = options ?? {};
  return listTenantRows<Trip>(TABLE, organisationId, {
    orderBy: "planned_start",
    orderAscending: false,
    select: TRIP_SELECT,
    ...listOptions,
    ...(dateRange
      ? (() => {
          const bounds = plannedStartBoundsForRange(dateRange);
          return {
            plannedStartGte: bounds.gte,
            plannedStartLt: bounds.lt,
          };
        })()
      : {}),
  });
}

export async function listTrips(
  organisationId: string,
  options?: ListTripsOptions
) {
  const rows = await listTripRows(organisationId, options);
  const names = await getTripDriverNames(rows.map((r) => r.id));
  return mergeTripDriverNames(rows, names);
}

export async function transitionTrip(
  tripId: string,
  event: TripEventType,
  notes?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<Trip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("transition_trip", {
    p_trip_id: tripId,
    p_event: event,
    p_notes: notes ?? null,
    p_metadata: metadata ?? {},
  });
  if (error) throw error;
  return data as Trip;
}

export async function cancelTrip(id: string): Promise<void> {
  await transitionTrip(id, "cancelled");
}

export async function updateTripServiceLocations(
  tripId: string,
  serviceLocations: string | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ service_locations: serviceLocations })
    .eq("id", tripId);
  if (error) throw error;
}

export async function generateTrips(
  organisationId: string,
  from: string,
  to: string,
  scheduleId?: string | null
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_trips", {
    p_organisation_id: organisationId,
    p_from: from,
    p_to: to,
    p_schedule_id: scheduleId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
