import {
  createTenantRow,
  createTenantRows,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import { writeAuditLog } from "@/services/audit.service";
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

export async function createVehicle(
  organisationId: string,
  input: Omit<
    Partial<Vehicle>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) {
  const created = await createTenantRow<Vehicle>(TABLE, {
    organisation_id: organisationId,
    vehicle_type: input.vehicle_type ?? "other",
    ...input,
  });
  try {
    await writeAuditLog({
      organisationId,
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: (created as Vehicle).id,
      metadata: { name: input.name },
    });
  } catch {
    // best-effort
  }
  return created;
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
  const created = await createTenantRows<Vehicle>(
    TABLE,
    rows.map((row) => ({
      organisation_id: organisationId,
      vehicle_type: row.vehicle_type ?? "other",
      ...row,
    }))
  );
  try {
    await writeAuditLog({
      organisationId,
      action: "vehicles.imported",
      entityType: "vehicle",
      metadata: { count: created.length },
    });
  } catch {
    // best-effort
  }
  return created;
}

export async function updateVehicle(id: string, input: Partial<Vehicle>) {
  const updated = await updateTenantRow<Vehicle>(TABLE, id, input);
  try {
    await writeAuditLog({
      organisationId: (updated as Vehicle).organisation_id,
      action: "vehicle.updated",
      entityType: "vehicle",
      entityId: id,
    });
  } catch {
    // best-effort
  }
  return updated;
}

export const deleteVehicle = (id: string) => softDeleteTenantRow(TABLE, id);

export async function restoreVehicle(id: string) {
  await restoreTenantRow(TABLE, id);
}
