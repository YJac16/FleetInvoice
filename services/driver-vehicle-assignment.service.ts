import { createClient } from "@/lib/supabase/client";

export type OpenDriverAssignment = {
  id: string;
  driver_id: string;
  vehicle_id: string;
  drivers?: { id: string; full_name: string } | null;
  vehicles?: {
    id: string;
    name: string;
    registration_number: string | null;
  } | null;
};

export async function listOpenDriverVehicleAssignments(
  organisationId: string
): Promise<OpenDriverAssignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("driver_vehicle_assignments")
    .select(
      "id, driver_id, vehicle_id, drivers:driver_id (id, full_name), vehicles:vehicle_id (id, name, registration_number)"
    )
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .is("ends_on", null);
  if (error) throw error;
  return (data ?? []) as OpenDriverAssignment[];
}

export async function assignVehicleToDriver(
  driverId: string,
  vehicleId: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("assign_vehicle_to_driver", {
    p_driver_id: driverId,
    p_vehicle_id: vehicleId,
  });
  if (error) throw error;
  return data as string;
}

export async function unassignVehicleFromDriver(driverId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("unassign_vehicle", {
    p_driver_id: driverId,
  });
  if (error) throw error;
}
