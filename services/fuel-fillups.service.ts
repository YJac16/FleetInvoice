import { createClient } from "@/lib/supabase/client";
import { isMissingRpcError } from "@/features/trips/lib/waybill-billing-readiness";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { FuelFillup } from "@/types";

const TABLE = "fuel_fillups";

/**
 * Never `select *` on fuel_fillups: unit_price, total_amount and currency are
 * column-revoked from authenticated (00086). Amounts come from the role-gated
 * list_fuel_fillup_amounts RPC.
 */
export const FUEL_FILLUP_SAFE_COLUMNS =
  "id, organisation_id, vehicle_id, driver_id, company_id, filled_at, odometer_km, litres, station_name, notes, created_by, created_at, updated_at, deleted_at";

export const FUEL_FILLUP_SELECT = `${FUEL_FILLUP_SAFE_COLUMNS}, vehicles:vehicle_id (id, name, registration_number), companies:company_id (id, name), drivers:driver_id (id, full_name)`;

type FuelAmountRow = {
  id: string;
  unit_price: number | null;
  total_amount: number | null;
  currency: string | null;
};

/**
 * Money columns for the fill-ups the caller may price. Uses the 00086 RPC.
 * Deploy order is app first, then 00086: until 00086 is applied the RPC does
 * not exist (PGRST202 / 42883) but the money columns are still selectable, so
 * fall back to reading them directly (RLS still applies). If they are not
 * selectable either (42501), return no amounts rather than failing the page.
 */
async function loadFuelFillupAmounts(
  organisationId: string
): Promise<FuelAmountRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_fuel_fillup_amounts", {
    p_organisation_id: organisationId,
  });
  if (!error) return (data ?? []) as FuelAmountRow[];
  if (!isMissingRpcError(error)) throw error;

  const fallback = await supabase
    .from(TABLE)
    .select("id, unit_price, total_amount, currency")
    .eq("organisation_id", organisationId)
    .is("deleted_at", null);
  if (fallback.error) {
    if ((fallback.error as { code?: string }).code === "42501") return [];
    throw fallback.error;
  }
  return (fallback.data ?? []) as FuelAmountRow[];
}

export async function listFuelFillups(
  organisationId: string,
  options?: ListTenantOptions & { includeAmounts?: boolean }
): Promise<FuelFillup[]> {
  const { includeAmounts, ...listOptions } = options ?? {};
  const rows = await listTenantRows<FuelFillup>(TABLE, organisationId, {
    orderBy: "filled_at",
    ...listOptions,
    select: FUEL_FILLUP_SELECT,
  });
  const masked = rows.map((r) => ({
    ...r,
    unit_price: null,
    total_amount: null,
    currency: null,
  }));
  if (!includeAmounts) return masked;

  const amounts = await loadFuelFillupAmounts(organisationId);
  const byId = new Map(amounts.map((a) => [a.id, a]));
  return masked.map((r) => {
    const a = byId.get(r.id);
    return a
      ? {
          ...r,
          unit_price: a.unit_price,
          total_amount: a.total_amount,
          currency: a.currency,
        }
      : r;
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
