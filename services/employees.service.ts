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
import type { Employee } from "@/types";

const TABLE = "employees";

export function listEmployees(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Employee>(TABLE, organisationId, {
    orderBy: "full_name",
    ...options,
  });
}

export const createEmployee = (
  organisationId: string,
  input: Omit<
    Partial<Employee>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { full_name: string }
) =>
  createTenantRow<Employee>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export async function createEmployeesBulk(
  organisationId: string,
  rows: Array<
    Omit<
      Partial<Employee>,
      | "id"
      | "organisation_id"
      | "created_at"
      | "updated_at"
      | "deleted_at"
      | "created_by"
    > & { full_name: string }
  >
) {
  const created = await createTenantRows<Employee>(
    TABLE,
    rows.map((row) => ({ organisation_id: organisationId, ...row }))
  );
  try {
    await writeAuditLog({
      organisationId,
      action: "employees.imported",
      entityType: "employee",
      metadata: { count: created.length },
    });
  } catch {
    // best-effort
  }
  return created;
}

export const updateEmployee = (id: string, input: Partial<Employee>) =>
  updateTenantRow<Employee>(TABLE, id, input);

export const deleteEmployee = (id: string) => softDeleteTenantRow(TABLE, id);

export async function restoreEmployee(id: string) {
  await restoreTenantRow(TABLE, id);
}
