import { moneyEqual } from "@/features/billing/lib/route-price-match";

export type TripPriceApply = {
  /** When true, the server stores or clears the per-trip price. */
  apply: boolean;
  /** Null clears a previously typed price so the route default or rate card is used. */
  price: number | null;
};

/**
 * Decide what to send with a trip save.
 * A typed amount that differs from the suggestion is stored on the trip.
 * Matching the suggestion clears that typed amount.
 * Matching an existing billing override leaves that override alone.
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
  if (input.suggestion != null && moneyEqual(amount, input.suggestion)) {
    return { apply: true, price: null };
  }
  return { apply: true, price: Math.round(amount * 100) / 100 };
}
