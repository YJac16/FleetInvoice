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
    select:
      "*, companies:company_id (id, name), assigned_driver:assigned_driver_id (id, full_name)",
    ...options,
  });
}

export const createVehicle = (
  organisationId: string,
  input: Omit<
    Partial<Vehicle>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<Vehicle>(TABLE, {
    organisation_id: organisationId,
    vehicle_type: input.vehicle_type ?? "other",
    ...input,
  });

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

export const updateVehicle = (id: string, input: Partial<Vehicle>) =>
  updateTenantRow<Vehicle>(TABLE, id, input);

export const deleteVehicle = (id: string) => softDeleteTenantRow(TABLE, id);

export async function restoreVehicle(id: string) {
  await restoreTenantRow(TABLE, id);
}
