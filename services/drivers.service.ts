import { listTenantRows, type ListTenantOptions } from "@/services/tenant-entity.service";
import {
  driverImportRowToCaptureFields,
  driverToCaptureFields,
  mergeDriverCaptureFields,
} from "@/lib/capture/fleet-fields";
import {
  archiveDriver,
  restoreDriverById,
  saveDriverCapture,
} from "@/services/capture.service";
import { createClient } from "@/lib/supabase/client";
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

async function fetchDriver(id: string): Promise<Driver> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error || !data) throw error ?? new Error("driver_not_found");
  return data as Driver;
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
  return saveDriverCapture({
    organisationId,
    fields: driverToCaptureFields(input),
  });
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
  if (rows.length === 0) return [];
  const res = await fetch("/api/capture/drivers/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId,
      rows: rows.map((row) => driverImportRowToCaptureFields(row as Record<string, unknown>)),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    ids?: string[];
  };
  if (!res.ok) throw new Error(body.error ?? "import_failed");

  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .in("id", body.ids ?? []);
  if (error) throw error;
  return (data ?? []) as Driver[];
}

export async function updateDriver(id: string, input: Partial<Driver>) {
  const existing = await fetchDriver(id);
  return saveDriverCapture({
    organisationId: existing.organisation_id,
    driverId: id,
    fields: mergeDriverCaptureFields(existing, input),
  });
}

export async function deleteDriver(id: string) {
  await archiveDriver(id);
}

export async function restoreDriver(id: string) {
  await restoreDriverById(id);
}
