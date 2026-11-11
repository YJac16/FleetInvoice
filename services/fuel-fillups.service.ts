import { createClient } from "@/lib/supabase/client";
import { isMissingRpcError } from "@/features/trips/lib/waybill-billing-readiness";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { FuelFillup } from "@/types";

const TABLE = "fuel_fillups";

const FILLUP_COLUMNS = [
  "id",
  "organisation_id",
  "vehicle_id",
  "driver_id",
  "company_id",
  "filled_at",
  "odometer_km",
  "litres",
  "currency",
  "station_name",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
  "deleted_at",
].join(", ");

const FILLUP_SELECT = `${FILLUP_COLUMNS}, vehicles:vehicle_id (id, name, registration_number), companies:company_id (id, name), drivers:driver_id (id, full_name)`;

type FuelAmount = {
  id: string;
  unit_price: number | null;
  total_amount: number | null;
};

async function fuelAmountsForStaff(
  organisationId: string
): Promise<FuelAmount[] | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_fuel_amounts_for_staff", {
    p_organisation_id: organisationId,
  });
  if (!error) return (data ?? []) as FuelAmount[];
  if (!isMissingRpcError(error)) throw error;

  const legacy = await supabase
    .from(TABLE)
    .select("id, unit_price, total_amount")
    .eq("organisation_id", organisationId)
    .is("deleted_at", null);
  if (legacy.error) return null;
  return (legacy.data ?? []) as FuelAmount[];
}

export async function listFuelFillups(
  organisationId: string,
  options?: ListTenantOptions
) {
  const rows = await listTenantRows<FuelFillup>(TABLE, organisationId, {
    orderBy: "filled_at",
    select: FILLUP_SELECT,
    ...options,
  });
  const amounts = await fuelAmountsForStaff(organisationId);
  if (!amounts) {
    return rows.map((row) => ({
      ...row,
      unit_price: null,
      total_amount: null,
    }));
  }
  const byId = new Map(amounts.map((amount) => [amount.id, amount]));
  return rows.map((row) => {
    const amount = byId.get(row.id);
    return {
      ...row,
      unit_price: amount?.unit_price ?? null,
      total_amount: amount?.total_amount ?? null,
    };
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
