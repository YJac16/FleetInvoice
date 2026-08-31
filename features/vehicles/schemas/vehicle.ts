import { z } from "zod";

import { ENTITY_STATUSES, VEHICLE_TYPES } from "@/lib/constants";

export const vehicleSchema = z.object({
  name: z.string().min(2, "Name is required"),
  registration_number: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.string().optional(),
  vehicle_type: z.enum(VEHICLE_TYPES),
  capacity: z.string().optional(),
  company_id: z.string().optional(),
  title_holder: z.string().optional(),
  owner_name: z.string().optional(),
  department: z.string().optional(),
  assigned_driver_id: z.string().optional(),
  permit_number: z.string().optional(),
  permit_expiry: z.string().optional(),
  licence_expiry: z.string().optional(),
  licence_type: z.string().optional(),
  comments: z.string().optional(),
  original_natis_in_file: z.boolean(),
  authority: z.string().optional(),
  current_odometer_km: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type VehicleValues = z.infer<typeof vehicleSchema>;

export function parseCapacity(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseYear(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return number;
}

export function parseKm(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatMakeModel(vehicle: {
  make?: string | null;
  model?: string | null;
  name?: string | null;
}): string {
  const makeModel = [vehicle.make, vehicle.model]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return makeModel || vehicle.name?.trim() || "—";
}

export function formatOdometerKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("en-US")} km`;
}
