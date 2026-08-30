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
import type { Driver } from "@/types";

const TABLE = "drivers";

export function listDrivers(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Driver>(TABLE, organisationId, {
    orderBy: "full_name",
    select: "*, profiles:profile_id (id, email, full_name)",
    ...options,
  });
}

export const createDriver = (
  organisationId: string,
  input: Omit<
    Partial<Driver>,
    | "id"
    | "organisation_id"
    | "created_at"
    | "updated_at"
    | "deleted_at"
    | "created_by"
    | "profiles"
  > & { full_name: string }
) =>
  createTenantRow<Driver>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export async function createDriversBulk(
  organisationId: string,
  rows: Array<
    Omit<
      Partial<Driver>,
      | "id"
      | "organisation_id"
      | "created_at"
      | "updated_at"
      | "deleted_at"
      | "created_by"
      | "profiles"
    > & { full_name: string }
  >
) {
  const created = await createTenantRows<Driver>(
    TABLE,
    rows.map((row) => ({ organisation_id: organisationId, ...row }))
  );
  try {
    await writeAuditLog({
      organisationId,
      action: "drivers.imported",
      entityType: "driver",
      metadata: { count: created.length },
    });
  } catch {
    // best-effort
  }
  return created;
}

export const updateDriver = (id: string, input: Partial<Driver>) =>
  updateTenantRow<Driver>(TABLE, id, input);

export const deleteDriver = (id: string) => softDeleteTenantRow(TABLE, id);

export async function restoreDriver(id: string) {
  await restoreTenantRow(TABLE, id);
  try {
    await writeAuditLog({
      organisationId: null,
      action: "driver.restored",
      entityType: "driver",
      entityId: id,
    });
  } catch {
    // best-effort
  }
}
