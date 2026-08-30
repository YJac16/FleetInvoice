import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Site } from "@/types";

const TABLE = "sites";

export function listSites(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Site>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createSite = (
  organisationId: string,
  input: Omit<
    Partial<Site>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<Site>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updateSite = (id: string, input: Partial<Site>) =>
  updateTenantRow<Site>(TABLE, id, input);

export const deleteSite = (id: string) => softDeleteTenantRow(TABLE, id);

export const restoreSite = (id: string) => restoreTenantRow(TABLE, id);
