import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Company } from "@/types";

const TABLE = "companies";

export function listCompanies(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Company>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createCompany = (
  organisationId: string,
  input: Omit<
    Partial<Company>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<Company>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updateCompany = (id: string, input: Partial<Company>) =>
  updateTenantRow<Company>(TABLE, id, input);

export const deleteCompany = (id: string) => softDeleteTenantRow(TABLE, id);

export const restoreCompany = (id: string) => restoreTenantRow(TABLE, id);
