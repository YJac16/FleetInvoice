import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Area } from "@/types";

const TABLE = "areas";

export function listAreas(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Area>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createArea = (
  organisationId: string,
  input: Omit<
    Partial<Area>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<Area>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updateArea = (id: string, input: Partial<Area>) =>
  updateTenantRow<Area>(TABLE, id, input);

export const deleteArea = (id: string) => softDeleteTenantRow(TABLE, id);

export const restoreArea = (id: string) => restoreTenantRow(TABLE, id);
