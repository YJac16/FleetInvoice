import { createClient } from "@/lib/supabase/client";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { FuelFillup } from "@/types";

const TABLE = "fuel_fillups";

const FILLUP_SELECT =
  "*, vehicles:vehicle_id (id, name, registration_number), companies:company_id (id, name), drivers:driver_id (id, full_name)";

export function listFuelFillups(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<FuelFillup>(TABLE, organisationId, {
    orderBy: "filled_at",
    select: FILLUP_SELECT,
    ...options,
  });
}

export type LogFuelFillupInput = {
  organisationId: string;
  vehicleId: string;
  odometerKm: number;
  litres: number;
  companyId?: string | null;
  driverId?: string | null;
  filledAt?: string | null;
  unitPrice?: number | null;
  stationName?: string | null;
  notes?: string | null;
};

/** Retired: fuel slips are submitted via `/api/fuel/slips` (driver) or admin back-capture. */
export async function logFuelFillup(): Promise<FuelFillup> {
  throw new Error(
    "Direct fuel logging is retired. Use fuel slip capture (driver) or admin back-capture."
  );
}
