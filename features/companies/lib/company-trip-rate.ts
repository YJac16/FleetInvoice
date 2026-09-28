import type { RateCard } from "@/types";

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
