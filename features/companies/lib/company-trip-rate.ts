import type { RateCard } from "@/types";

/** Trip rate effective dates are resolved in Postgres (`resolve_trip_line_rate`): inclusive per card; adjacent cards use effective_to = D and effective_from = D + 1. */

export function formatTripRateZar(amount: number): string {
  return amount.toFixed(2);
}

export function latestTripRateCard(cards: RateCard[]): RateCard | null {
  const tripCards = cards.filter(
    (c) => c.line_type === "trip" && !c.deleted_at && c.company_id
  );
  if (tripCards.length === 0) return null;
  return tripCards.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]!;
}

/** Today's date in SAST (YYYY-MM-DD). */
export function defaultEffectiveFromDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Default "effective from" for a trip-rate edit: the earliest unbilled trip
 * date (so past trips find a rate), falling back to today. Users can still
 * pick any date.
 */
export function pickDefaultEffectiveFrom(
  earliestUnbilled: string | null | undefined,
  now: Date = new Date()
): string {
  return earliestUnbilled && /^\d{4}-\d{2}-\d{2}$/.test(earliestUnbilled)
    ? earliestUnbilled
    : defaultEffectiveFromDate(now);
}

/**
 * Only send a trip rate when the user changed amount or date compared with the
 * current card. Re-saving company details must not touch rates.
 */
export function tripRateChanged(
  latest: Pick<RateCard, "unit_amount" | "effective_from"> | null,
  amount: number,
  effectiveFrom: string
): boolean {
  if (!latest) return true;
  return Number(latest.unit_amount) !== amount || latest.effective_from !== effectiveFrom;
}
