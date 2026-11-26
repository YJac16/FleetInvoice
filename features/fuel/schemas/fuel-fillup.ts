import { z } from "zod";

/**
 * No unit price field: every fill-up is priced from the confirmed fuel price
 * table on the slip date (00094), whoever logs it. Fuel type is required.
 */
export const fuelFillupSchema = z.object({
  vehicle_id: z.string().uuid("Select a vehicle"),
  company_id: z.string().optional(),
  fuel_type: z.string().min(1, "Select a fuel type"),
  odometer_km: z.string().min(1, "Odometer is required"),
  litres: z.string().min(1, "Litres is required"),
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

export const fuelPriceSchema = z.object({
  fuel_type: z.string().min(1, "Select a fuel type"),
  region: z.string().min(1, "Select a region"),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Effective date is required"),
  price_per_litre: z.string().min(1, "Price is required"),
});

export type FuelPriceValues = z.infer<typeof fuelPriceSchema>;
