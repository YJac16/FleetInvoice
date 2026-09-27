import type { Driver } from "@/types";
import type { Vehicle } from "@/types";

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

/** JSON fields for save_driver_capture RPC. */
export function driverToCaptureFields(
  input: Partial<Driver> & { full_name?: string }
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.full_name !== undefined) fields.full_name = input.full_name;
  if (input.email !== undefined) fields.email = input.email ?? "";
  if (input.phone !== undefined) fields.phone = input.phone ?? "";
  if (input.license_number !== undefined) fields.license_number = input.license_number ?? "";
  if (input.license_code !== undefined) fields.license_code = input.license_code ?? "";
  if (input.license_code_other !== undefined) {
    fields.license_code_other = input.license_code_other ?? "";
  }
  if (input.license_expires_on !== undefined) {
    fields.license_expires_on = input.license_expires_on ?? "";
  }
  if (input.pdp_number !== undefined) fields.pdp_number = input.pdp_number ?? "";
  if (input.pdp_categories !== undefined) fields.pdp_categories = input.pdp_categories ?? "";
  if (input.pdp_expires_on !== undefined) fields.pdp_expires_on = input.pdp_expires_on ?? "";
  if (input.profile_id !== undefined) fields.profile_id = input.profile_id ?? "";
  if (input.status !== undefined) fields.status = input.status;
  return fields;
}

/** JSON fields for save_vehicle_capture RPC. */
export function vehicleToCaptureFields(
  input: Partial<Vehicle> & { name?: string }
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.registration_number !== undefined) {
    fields.registration_number = input.registration_number ?? "";
  }
  if (input.vin !== undefined) fields.vin = input.vin ?? "";
  if (input.engine_number !== undefined) fields.engine_number = input.engine_number ?? "";
  if (input.make !== undefined) fields.make = input.make ?? "";
  if (input.model !== undefined) fields.model = input.model ?? "";
  if (input.model_year !== undefined && input.model_year !== null) {
    fields.model_year = String(input.model_year);
  }
  if (input.colour !== undefined) fields.colour = input.colour ?? "";
  if (input.classification !== undefined) fields.classification = input.classification ?? "";
  if (input.operating_permit_number !== undefined) {
    fields.operating_permit_number = input.operating_permit_number ?? "";
  }
  if (input.operating_permit_expires_on !== undefined) {
    fields.operating_permit_expires_on = input.operating_permit_expires_on ?? "";
  }
  if (input.license_disc_expires_on !== undefined) {
    fields.license_disc_expires_on = input.license_disc_expires_on ?? "";
  }
  if (input.vehicle_type !== undefined) fields.vehicle_type = input.vehicle_type;
  if (input.capacity !== undefined && input.capacity !== null) {
    fields.capacity = String(input.capacity);
  }
  if (input.company_id !== undefined) fields.company_id = input.company_id ?? "";
  if (input.status !== undefined) fields.status = input.status;
  return fields;
}

export function mergeDriverCaptureFields(
  existing: Driver,
  patch: Partial<Driver>
): Record<string, unknown> {
  return driverToCaptureFields({ ...existing, ...patch });
}

export function mergeVehicleCaptureFields(
  existing: Vehicle,
  patch: Partial<Vehicle>
): Record<string, unknown> {
  return vehicleToCaptureFields({ ...existing, ...patch });
}

export function driverImportRowToCaptureFields(row: Record<string, unknown>): Record<string, unknown> {
  return driverToCaptureFields({
    full_name: str(row.full_name) ?? "",
    email: str(row.email) ?? null,
    phone: str(row.phone) ?? null,
    license_number: str(row.license_number) ?? null,
    license_code: str(row.license_code) ?? null,
    license_code_other: str(row.license_code_other) ?? null,
    license_expires_on: str(row.license_expires_on) ?? null,
    pdp_number: str(row.pdp_number) ?? null,
    pdp_expires_on: str(row.pdp_expires_on) ?? null,
    status: (str(row.status) as Driver["status"]) ?? "active",
  });
}

export function vehicleImportRowToCaptureFields(row: Record<string, unknown>): Record<string, unknown> {
  return vehicleToCaptureFields({
    name: str(row.name) ?? "",
    registration_number: str(row.registration_number) ?? null,
    make: str(row.make) ?? null,
    model: str(row.model) ?? null,
    vehicle_type: (str(row.vehicle_type) as Vehicle["vehicle_type"]) ?? "other",
    status: (str(row.status) as Vehicle["status"]) ?? "active",
  });
}
