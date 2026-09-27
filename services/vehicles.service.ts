import {
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import {
  mergeVehicleCaptureFields,
  vehicleImportRowToCaptureFields,
  vehicleToCaptureFields,
} from "@/lib/capture/fleet-fields";
import { saveVehicleCapture } from "@/services/capture.service";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle } from "@/types";

const TABLE = "vehicles";

export function listVehicles(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Vehicle>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

async function fetchVehicle(id: string): Promise<Vehicle> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error || !data) throw error ?? new Error("vehicle_not_found");
  return data as Vehicle;
}

export async function createVehicle(
  organisationId: string,
  input: Omit<
    Partial<Vehicle>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) {
  return saveVehicleCapture({
    organisationId,
    fields: vehicleToCaptureFields({
      vehicle_type: input.vehicle_type ?? "other",
      ...input,
    }),
  });
}

export async function createVehiclesBulk(
  organisationId: string,
  rows: Array<
    Omit<
      Partial<Vehicle>,
      | "id"
      | "organisation_id"
      | "created_at"
      | "updated_at"
      | "deleted_at"
      | "created_by"
    > & { name: string }
  >
) {
  if (rows.length === 0) return [];
  const res = await fetch("/api/capture/vehicles/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId,
      rows: rows.map((row) =>
        vehicleImportRowToCaptureFields({
          ...row,
          vehicle_type: row.vehicle_type ?? "other",
        } as Record<string, unknown>)
      ),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    ids?: string[];
  };
  if (!res.ok) throw new Error(body.error ?? "import_failed");

  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .in("id", body.ids ?? []);
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export async function updateVehicle(id: string, input: Partial<Vehicle>) {
  const existing = await fetchVehicle(id);
  return saveVehicleCapture({
    organisationId: existing.organisation_id,
    vehicleId: id,
    fields: mergeVehicleCaptureFields(existing, input),
  });
}

export const deleteVehicle = (id: string) => softDeleteTenantRow(TABLE, id);

export async function restoreVehicle(id: string) {
  await restoreTenantRow(TABLE, id);
}
