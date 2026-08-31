import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/services/audit.service";
import type { VehicleUpdate } from "@/types";

const TABLE = "vehicle_updates";

export async function listVehicleUpdates(
  organisationId: string,
  vehicleId: string
): Promise<VehicleUpdate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VehicleUpdate[];
}

export async function createVehicleUpdate(input: {
  organisationId: string;
  vehicleId: string;
  note: string;
  odometerKm?: number | null;
  recordedAt?: string | null;
}): Promise<VehicleUpdate> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organisation_id: input.organisationId,
      vehicle_id: input.vehicleId,
      note: input.note,
      odometer_km: input.odometerKm ?? null,
      recorded_at: input.recordedAt || new Date().toISOString(),
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: input.organisationId,
      action: "vehicle_update.created",
      entityType: "vehicle_update",
      entityId: data.id,
      metadata: { vehicle_id: input.vehicleId },
    });
  } catch {
    // best-effort
  }

  return data as VehicleUpdate;
}

export async function softDeleteVehicleUpdate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
