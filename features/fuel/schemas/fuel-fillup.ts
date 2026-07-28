import { z } from "zod";

export const fuelFillupSchema = z.object({
  vehicle_id: z.string().uuid("Select a vehicle"),
  company_id: z.string().optional(),
  odometer_km: z.string().min(1, "Odometer is required"),
  litres: z.string().min(1, "Litres is required"),
  unit_price: z.string().optional(),
  station_name: z.string().optional(),
  notes: z.string().optional(),
  filled_at: z.string().optional(),
});

export type FuelFillupValues = z.infer<typeof fuelFillupSchema>;

export function parsePositiveNumber(
  value: string | undefined,
  label: string
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return n;
}

export function parseNonNegativeNumber(
  value: string | undefined,
  label: string
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be zero or greater`);
  }
  return n;
}

export function parseOptionalNumber(
  value: string | undefined
): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Unit price must be zero or greater");
  }
  return n;
}
