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

export function defaultEffectiveFromDate(): string {
  return new Date().toISOString().slice(0, 10);
}
