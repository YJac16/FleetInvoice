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

export async function logFuelFillup(
  input: LogFuelFillupInput
): Promise<FuelFillup> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("log_fuel_fillup", {
    p_organisation_id: input.organisationId,
    p_vehicle_id: input.vehicleId,
    p_odometer_km: input.odometerKm,
    p_litres: input.litres,
    p_company_id: input.companyId ?? null,
    p_driver_id: input.driverId ?? null,
    p_filled_at: input.filledAt ?? null,
    p_unit_price: input.unitPrice ?? null,
    p_station_name: input.stationName ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as FuelFillup;
}
