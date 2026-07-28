import { createClient } from "@/lib/supabase/client";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { TripEventType } from "@/lib/constants";
import type { Trip } from "@/types";

const TABLE = "trips";

const TRIP_SELECT =
  "*, routes:route_id (name), trip_assignments(id, driver_id, vehicle_id, released_at, drivers:driver_id (full_name), vehicles:vehicle_id (name, registration_number, capacity))";

export function listTrips(organisationId: string, options?: ListTenantOptions) {
  return listTenantRows<Trip>(TABLE, organisationId, {
    orderBy: "planned_start",
    select: TRIP_SELECT,
    ...options,
  });
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
