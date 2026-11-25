import { DEFAULT_FUEL_REGION } from "@/lib/fuel/fuel-types";
import type { FuelFillup, FuelPrice } from "@/types";

/** SAST calendar date (YYYY-MM-DD) of an instant: the fill-up "slip date". */
export function slipDate(instant: string | Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * A fill counts towards money totals only when it carries a locked amount.
 * needs_price rows have null money and are never totalled as R0.
 */
export function isPricedFill(f: Pick<FuelFillup, "price_status" | "total_amount">): boolean {
  return f.total_amount != null && f.price_status !== "needs_price";
}

export function needsPrice(f: Pick<FuelFillup, "price_status">): boolean {
  return f.price_status === "needs_price";
}

/**
 * Mirrors resolve_fuel_unit_price (00093) for display only: the latest
 * CONFIRMED org row with effective_from <= onDate. Global and pending rows
 * never count.
 */
export function currentConfirmedRate(
  prices: FuelPrice[],
  organisationId: string,
  fuelType: string | null | undefined,
  region: string | null | undefined,
  onDate: string
): FuelPrice | null {
  if (!fuelType) return null;
  const r = region || DEFAULT_FUEL_REGION;
  let best: FuelPrice | null = null;
  for (const p of prices) {
    if (p.organisation_id !== organisationId || p.status !== "confirmed") continue;
    if (p.fuel_type !== fuelType || p.region !== r) continue;
    if (p.effective_from > onDate) continue;
    if (!best || p.effective_from > best.effective_from) best = p;
  }
  return best;
}

export type VehicleFuelHistory = {
  lastLocked: FuelFillup | null;
  currentRate: FuelPrice | null;
  /** current confirmed rate minus last locked unit price (R/l); null if either missing. */
  rateDelta: number | null;
  costPerKm: Array<{ id: string; filled_at: string; km: number; amount: number; costPerKm: number }>;
  averageCostPerKm: number | null;
  trend: Array<{ id: string; filled_at: string; unit_price: number }>;
  trendDirection: "up" | "down" | "flat" | null;
  needsPriceCount: number;
};

/**
 * Finance-only vehicle history: last locked purchase vs current confirmed
 * rate, cost/km (total_amount / odometer delta since the previous fill) and
 * the unit-price trend. Unpriced fills are skipped, never counted as R0.
 */
export function vehicleFuelHistory(
  fills: FuelFillup[],
  vehicleId: string,
  prices: FuelPrice[],
  organisationId: string,
  today: string
): VehicleFuelHistory {
  const own = fills
    .filter((f) => f.vehicle_id === vehicleId && !f.deleted_at)
    .sort((a, b) =>
      a.filled_at === b.filled_at
        ? Number(a.odometer_km) - Number(b.odometer_km)
        : a.filled_at < b.filled_at
          ? -1
          : 1
    );

  const priced = own.filter(isPricedFill);
  const lastLocked = priced.at(-1) ?? null;
  const currentRate = lastLocked
    ? currentConfirmedRate(prices, organisationId, lastLocked.fuel_type, lastLocked.region, today)
    : null;
  const rateDelta =
    lastLocked?.unit_price != null && currentRate
      ? Math.round((currentRate.price_per_litre - Number(lastLocked.unit_price)) * 10000) / 10000
      : null;

  const costPerKm: VehicleFuelHistory["costPerKm"] = [];
  for (let i = 1; i < own.length; i++) {
    const f = own[i];
    if (!isPricedFill(f)) continue;
    const km = Number(f.odometer_km) - Number(own[i - 1].odometer_km);
    if (!(km > 0)) continue;
    const amount = Number(f.total_amount);
    costPerKm.push({ id: f.id, filled_at: f.filled_at, km, amount, costPerKm: amount / km });
  }
  const totalKm = costPerKm.reduce((s, c) => s + c.km, 0);
  const totalAmount = costPerKm.reduce((s, c) => s + c.amount, 0);

  const trend = priced
    .filter((f) => f.unit_price != null)
    .map((f) => ({ id: f.id, filled_at: f.filled_at, unit_price: Number(f.unit_price) }));
  let trendDirection: VehicleFuelHistory["trendDirection"] = null;
  if (trend.length >= 2) {
    const [a, b] = trend.slice(-2);
    trendDirection = b.unit_price > a.unit_price ? "up" : b.unit_price < a.unit_price ? "down" : "flat";
  }

  return {
    lastLocked,
    currentRate,
    rateDelta,
    costPerKm,
    averageCostPerKm: totalKm > 0 ? totalAmount / totalKm : null,
    trend,
    trendDirection,
    needsPriceCount: own.filter(needsPrice).length,
  };
}
