import { createClient } from "@/lib/supabase/client";
import type { Trip, TripAssignment } from "@/types";

const TABLE = "trip_assignments";

const ASSIGNMENT_SELECT =
  "*, drivers:driver_id (id, full_name), vehicles:vehicle_id (id, name, registration_number)";

export async function assignTrip(
  tripId: string,
  driverId: string,
  vehicleId?: string | null
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("assign_trip", {
    p_trip_id: tripId,
    p_driver_id: driverId,
    p_vehicle_id: vehicleId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function listAssignmentsForTrip(
  organisationId: string,
  tripId: string
): Promise<TripAssignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(ASSIGNMENT_SELECT)
    .eq("organisation_id", organisationId)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("assigned_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as TripAssignment[]) ?? [];
}

/**
 * Resolves the `drivers.id` linked to the signed-in user's profile for an
 * organisation (via `drivers.profile_id = auth.uid()`), or null if the
 * current user has no driver record there.
 */
export async function getCurrentDriverId(
  organisationId: string
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("drivers")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Trips currently assigned to the signed-in driver (active assignment only).
 * RLS lets any org member read `trip_assignments`, so we also filter by
 * `driver_id` client-side to be safe about who "my" trips belongs to.
 */
export async function listMyDriverTrips(
  organisationId: string
): Promise<Trip[]> {
  const driverId = await getCurrentDriverId(organisationId);
  if (!driverId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, driver_id, vehicle_id, released_at, vehicles:vehicle_id (id, name, registration_number, capacity), trips:trip_id (*, routes:route_id (name))"
    )
    .eq("organisation_id", organisationId)
    .eq("driver_id", driverId)
    .is("deleted_at", null)
    .is("released_at", null)
    .order("assigned_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    driver_id: string;
    vehicle_id: string | null;
    released_at: string | null;
    vehicles: TripAssignment["vehicles"];
    trips: Trip | null;
  }>)
    .filter((row) => row.driver_id === driverId && row.trips)
    .map((row) => {
      const trip = row.trips as Trip;
      return {
        ...trip,
        trip_assignments: [
          {
            id: row.id,
            organisation_id: organisationId,
            trip_id: trip.id,
            driver_id: row.driver_id,
            vehicle_id: row.vehicle_id,
            assigned_by: null,
            assigned_at: trip.created_at,
            released_at: row.released_at,
            created_at: trip.created_at,
            updated_at: trip.updated_at,
            deleted_at: null,
            vehicles: row.vehicles ?? null,
          },
        ],
      } satisfies Trip;
    });
}
