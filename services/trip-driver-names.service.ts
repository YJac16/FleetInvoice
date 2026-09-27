import { createClient } from "@/lib/supabase/client";

export type TripDriverName = {
  trip_id: string;
  driver_id: string;
  full_name: string;
};

export async function getTripDriverNames(
  tripIds: string[]
): Promise<TripDriverName[]> {
  if (tripIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_trip_driver_names", {
    p_trip_ids: tripIds,
  });
  if (error) throw error;
  return (data ?? []) as TripDriverName[];
}

/** Attach `{ full_name }` on each trip_assignment for callers without drivers table access. */
export function mergeTripDriverNames<
  T extends {
    id: string;
    trip_assignments?: Array<{
      driver_id: string;
      drivers?: { full_name: string } | null;
    }> | null;
  },
>(trips: T[], names: TripDriverName[]): T[] {
  const byTrip = new Map(names.map((n) => [n.trip_id, n]));
  return trips.map((trip) => {
    const nameRow = byTrip.get(trip.id);
    if (!nameRow || !trip.trip_assignments?.length) return trip;
    return {
      ...trip,
      trip_assignments: trip.trip_assignments.map((ta) => ({
        ...ta,
        drivers: ta.drivers ?? { full_name: nameRow.full_name },
      })),
    };
  });
}
