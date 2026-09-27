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

export async function createDriver(
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
) {
  const created = await createTenantRow<Driver>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });
  try {
    await writeAuditLog({
      organisationId,
      action: "driver.created",
      entityType: "driver",
      entityId: (created as Driver).id,
      metadata: { full_name: input.full_name },
    });
  } catch {
    // best-effort
  }
  return created;
}

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

export async function updateDriver(id: string, input: Partial<Driver>) {
  const updated = await updateTenantRow<Driver>(TABLE, id, input);
  try {
    await writeAuditLog({
      organisationId: (updated as Driver).organisation_id,
      action: "driver.updated",
      entityType: "driver",
      entityId: id,
    });
  } catch {
    // best-effort
  }
  return updated;
}

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
