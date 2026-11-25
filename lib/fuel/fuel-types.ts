/**
 * Fuel types and regions used by the fuel price table (00093) and fill-ups
 * (00094). The DB accepts any `^[a-z0-9_]{2,40}$` code, so adding a type here
 * is a config change, not a migration. No prices live here (rates come from
 * the DMPR cron or admin entry).
 */
export const FUEL_TYPES = [
  { value: "diesel_50ppm", label: "Diesel 50ppm" },
  { value: "diesel_500ppm", label: "Diesel 500ppm" },
  { value: "petrol_95", label: "Petrol 95" },
  { value: "petrol_93", label: "Petrol 93" },
] as const;

export type FuelTypeCode = (typeof FUEL_TYPES)[number]["value"];

export const FUEL_REGIONS = [
  { value: "coastal", label: "Coastal (Cape Town)" },
  { value: "inland", label: "Inland (Gauteng)" },
] as const;

export type FuelRegionCode = (typeof FUEL_REGIONS)[number]["value"];

/** Rule: default region is coastal (Cape Town). */
export const DEFAULT_FUEL_REGION: FuelRegionCode = "coastal";

export function fuelTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return FUEL_TYPES.find((t) => t.value === code)?.label ?? code;
}

export function fuelRegionLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return FUEL_REGIONS.find((r) => r.value === code)?.label ?? code;
}
