import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { PickupPoint } from "@/types";

const TABLE = "pickup_points";

export function listPickupPoints(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<PickupPoint>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createPickupPoint = (
  organisationId: string,
  input: Omit<
    Partial<PickupPoint>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<PickupPoint>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updatePickupPoint = (id: string, input: Partial<PickupPoint>) =>
  updateTenantRow<PickupPoint>(TABLE, id, input);

export const deletePickupPoint = (id: string) => softDeleteTenantRow(TABLE, id);

export const restorePickupPoint = (id: string) => restoreTenantRow(TABLE, id);
