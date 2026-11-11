import { createClient } from "@/lib/supabase/client";
import {
  createTenantRow,
  listTenantRows,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { RoutePrice } from "@/types";

const TABLE = "route_prices";
const SELECT = "*, companies:company_id (id, name)";

export type TripPriceSuggestion = {
  unitAmount: number | null;
  priceSource: "route_price" | "rate_card" | "none";
  routePriceId: string | null;
  rateCardId: string | null;
  label: string | null;
};

export async function listRoutePrices(
  organisationId: string,
  options?: ListTenantOptions
): Promise<RoutePrice[]> {
  return listTenantRows<RoutePrice>(TABLE, organisationId, {
    orderBy: "label",
    select: SELECT,
    ...options,
  });
}

export type RoutePriceInput = {
  company_id: string;
  label: string;
  match_kind: RoutePrice["match_kind"];
  stops: string[];
  anchor_place: string | null;
  places: string[];
  bidirectional: boolean;
  unit_amount: number;
  priority?: number;
  notes?: string | null;
  active?: boolean;
  currency?: string;
};

export function createRoutePrice(organisationId: string, input: RoutePriceInput) {
  return createTenantRow<RoutePrice>(TABLE, {
    organisation_id: organisationId,
    currency: "ZAR",
    priority: 0,
    active: true,
    ...input,
  });
}

export function updateRoutePrice(id: string, input: Partial<RoutePriceInput>) {
  return updateTenantRow<RoutePrice>(TABLE, id, input);
}

export async function archiveRoutePrice(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreRoutePrice(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, active: true })
    .eq("id", id);
  if (error) throw error;
}

export async function suggestTripUnitPrice(input: {
  organisationId: string;
  companyId: string;
  areaText: string;
  tripDate?: string | null;
}): Promise<TripPriceSuggestion> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("suggest_trip_unit_price", {
    p_organisation_id: input.organisationId,
    p_company_id: input.companyId,
    p_area_text: input.areaText,
    p_trip_date: input.tripDate || null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        unit_amount: number | null;
        price_source: TripPriceSuggestion["priceSource"];
        route_price_id: string | null;
        rate_card_id: string | null;
        label: string | null;
      }
    | null
    | undefined;
  if (!row) {
    return {
      unitAmount: null,
      priceSource: "none",
      routePriceId: null,
      rateCardId: null,
      label: null,
    };
  }
  return {
    unitAmount: row.unit_amount == null ? null : Number(row.unit_amount),
    priceSource: row.price_source ?? "none",
    routePriceId: row.route_price_id,
    rateCardId: row.rate_card_id,
    label: row.label,
  };
}

export async function getTripInvoiceUnitPrice(tripId: string): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_lines")
    .select("unit_price")
    .eq("trip_id", tripId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { unit_price: number | string };
  return Number(row.unit_price);
}
