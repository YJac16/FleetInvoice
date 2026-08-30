import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Schedule } from "@/types";

const TABLE = "schedules";

export function listSchedules(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Schedule>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createSchedule = (
  organisationId: string,
  input: Omit<
    Partial<Schedule>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string; route_id: string }
) =>
  createTenantRow<Schedule>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updateSchedule = (id: string, input: Partial<Schedule>) =>
  updateTenantRow<Schedule>(TABLE, id, input);

export const deleteSchedule = (id: string) => softDeleteTenantRow(TABLE, id);

export const restoreSchedule = (id: string) => restoreTenantRow(TABLE, id);
