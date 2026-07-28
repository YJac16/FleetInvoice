import { z } from "zod";

import { ENTITY_STATUSES, VEHICLE_TYPES } from "@/lib/constants";

export const vehicleSchema = z.object({
  name: z.string().min(2, "Name is required"),
  registration_number: z.string().optional(),
  vehicle_type: z.enum(VEHICLE_TYPES),
  capacity: z.string().optional(),
  company_id: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type VehicleValues = z.infer<typeof vehicleSchema>;

export function parseCapacity(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
