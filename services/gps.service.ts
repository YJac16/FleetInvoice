import { createClient } from "@/lib/supabase/client";
import type { GpsLastPosition, GpsPointInput } from "@/types";

export async function ingestGpsPoints(
  organisationId: string,
  points: GpsPointInput[]
): Promise<number> {
  const supabase = createClient();
  const payload = points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    recorded_at: p.recorded_at ?? null,
    accuracy_m: p.accuracy_m ?? null,
    vehicle_id: p.vehicle_id ?? null,
    trip_id: p.trip_id ?? null,
    driver_id: p.driver_id ?? null,
  }));
  const { data, error } = await supabase.rpc("ingest_gps_points", {
    p_organisation_id: organisationId,
    p_points: payload,
  });
  if (error) throw error;
  return data as number;
}

export async function listGpsLastPositions(
  organisationId: string
): Promise<GpsLastPosition[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("gps_last_positions")
    .select(
      "*, drivers:driver_id (id, full_name), vehicles:vehicle_id (id, name, registration_number)"
    )
    .eq("organisation_id", organisationId)
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as GpsLastPosition[]) ?? [];
}
