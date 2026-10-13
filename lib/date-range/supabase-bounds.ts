import type { ResolvedDateRange } from "@/lib/date-range/sast-range";

/** SAST offset used for trip `planned_start` timestamptz filters (no DST). */
export function plannedStartBoundsForRange(range: ResolvedDateRange): {
  gte: string;
  lt: string;
} {
  return {
    gte: `${range.from}T00:00:00+02:00`,
    lt: `${range.toExclusive}T00:00:00+02:00`,
  };
}

export function periodStartBoundsForRange(range: ResolvedDateRange): {
  gte: string;
  lte: string;
} {
  return { gte: range.from, lte: range.to };
}

/** Invoice period overlaps filter range [from, to] (inclusive calendar dates). */
export function invoicePeriodOverlapBoundsForRange(range: ResolvedDateRange): {
  periodEndGte: string;
  periodStartLte: string;
} {
  return {
    periodEndGte: range.from,
    periodStartLte: range.to,
  };
}
