import { createClient } from "@/lib/supabase/client";
import type { FuelPrice } from "@/types";

/** Finance only (00093): global reference rows + the org's own rows. */
export async function listFuelPrices(organisationId: string): Promise<FuelPrice[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_fuel_prices", {
    p_organisation_id: organisationId,
  });
  if (error) throw error;
  return ((data ?? []) as FuelPrice[]).map((p) => ({
    ...p,
    price_per_litre: Number(p.price_per_litre),
  }));
}

/**
 * One-click: copy the current global pending rows into confirmed rows for
 * this org only. Idempotent; returns the number of new org rows.
 */
export async function confirmFuelPrices(
  organisationId: string,
  effectiveFrom?: string | null
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("confirm_fuel_prices", {
    p_organisation_id: organisationId,
    p_effective_from: effectiveFrom ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type UpsertOrgFuelPriceInput = {
  organisationId: string;
  fuelType: string;
  region: string;
  effectiveFrom: string;
  pricePerLitre: number;
};

/** Manual fallback rate (confirmed). A rate that already priced fills is locked. */
export async function upsertOrgFuelPrice(input: UpsertOrgFuelPriceInput): Promise<FuelPrice> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_org_fuel_price", {
    p_organisation_id: input.organisationId,
    p_fuel_type: input.fuelType,
    p_effective_from: input.effectiveFrom,
    p_price_per_litre: input.pricePerLitre,
    p_region: input.region,
  });
  if (error) throw error;
  return data as FuelPrice;
}

export type FuelBackfillResult = {
  priced: number;
  still_needs_price: number;
  skipped_no_fuel_type: number;
};

/** Opt-in admin action (00095): price needs_price fills that now have a rate. */
export async function backfillUnpricedFuelFillups(
  organisationId: string
): Promise<FuelBackfillResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("backfill_unpriced_fuel_fillups", {
    p_organisation_id: organisationId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as FuelBackfillResult | undefined;
  return {
    priced: Number(row?.priced ?? 0),
    still_needs_price: Number(row?.still_needs_price ?? 0),
    skipped_no_fuel_type: Number(row?.skipped_no_fuel_type ?? 0),
  };
}
