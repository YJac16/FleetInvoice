import { moneyEqual } from "@/features/billing/lib/route-price-match";

export type TripPriceApply = {
  /** When true, the server stores or clears the per-trip price. */
  apply: boolean;
  /** Null clears a previously typed price so the route default or rate card is used. */
  price: number | null;
};

/**
 * Decide what to send with a trip save.
 * A typed amount is stored on the trip, including when it matches the suggestion
 * but differs from the invoice line already saved. Matching the suggestion on a
 * new trip clears any typed price so the server can apply the route default.
 * An unchanged line, or a price that still matches a billing override, is left alone.
 */
export function tripPriceApplyArgs(input: {
  entered: string;
  suggestion: number | null;
  overrideAmount?: number | null;
  existingUnitPrice?: number | null;
  routeChanged?: boolean;
}): TripPriceApply {
  const trimmed = input.entered.trim();
  if (!trimmed) return { apply: false, price: null };
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return { apply: false, price: null };
  if (
    !input.routeChanged &&
    input.existingUnitPrice != null &&
    moneyEqual(amount, input.existingUnitPrice)
  ) {
    return { apply: false, price: null };
  }
  if (input.overrideAmount != null && moneyEqual(amount, input.overrideAmount)) {
    return { apply: false, price: null };
  }
  const rounded = Math.round(amount * 100) / 100;
  if (input.suggestion != null && moneyEqual(amount, input.suggestion)) {
    // The line already has a different amount. Store the suggestion explicitly
    // so sync does not keep that snapshot when the route itself did not change.
    if (input.existingUnitPrice != null && !moneyEqual(amount, input.existingUnitPrice)) {
      return { apply: true, price: rounded };
    }
    return { apply: true, price: null };
  }
  return { apply: true, price: rounded };
}
