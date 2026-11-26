/**
 * Worth keeping: per vehicle, what a vehicle earned vs what it cost in the
 * period. Fixed costs (insurance, licences, finance, driver pay) are not
 * included. Pure: the query layer supplies the totals.
 */

export type Verdict = "keep" | "review" | "no_activity";

export type VehicleTotals = {
  revenue: number;
  bills: number;
  fuel: number;
};

export function contribution(t: VehicleTotals): number {
  return round2(t.revenue - t.bills - t.fuel);
}

export function verdictFor(t: VehicleTotals): Verdict {
  const cost = t.bills + t.fuel;
  if (t.revenue === 0 && cost === 0) return "no_activity";
  if (contribution(t) < 0) return "review";
  if (t.revenue === 0 && cost > 0) return "review";
  return "keep";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  keep: "Keep",
  review: "Review",
  no_activity: "No activity",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const OWNER_FILTERS = ["all", "yaseen", "fadia"] as const;
export type OwnerFilter = (typeof OWNER_FILTERS)[number];

export const PERIOD_MONTHS = [1, 3, 6, 12] as const;
export const DEFAULT_PERIOD_MONTHS = 3;

export function parseOwner(value: string | undefined): OwnerFilter {
  return (OWNER_FILTERS as readonly string[]).includes(value ?? "") ? (value as OwnerFilter) : "all";
}

export function parsePeriod(value: string | undefined): number {
  const n = Number(value);
  return (PERIOD_MONTHS as readonly number[]).includes(n) ? n : DEFAULT_PERIOD_MONTHS;
}
