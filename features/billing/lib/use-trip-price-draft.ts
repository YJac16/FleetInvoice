import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  tripPriceApplyArgs,
  type TripPriceApply,
} from "@/features/billing/lib/trip-price-entry";
import {
  suggestTripUnitPrice,
  type TripPriceSuggestion,
} from "@/services/route-prices.service";

export function tripPriceHint(
  suggestion: TripPriceSuggestion | null,
  loading: boolean
): string {
  if (loading && !suggestion) return "Looking up the default price…";
  if (!suggestion || suggestion.priceSource === "none" || suggestion.unitAmount == null) {
    return "No route price or company rate matched yet. You can still type a price.";
  }
  const amount = suggestion.unitAmount.toFixed(2);
  if (suggestion.priceSource === "route_price") {
    const name = suggestion.label ? ` (${suggestion.label})` : "";
    return `Route default R${amount}${name}. Change it for this trip if you need to.`;
  }
  return `Company rate R${amount}. No route price matched. Change it for this trip if you need to.`;
}

export function useTripPriceDraft(options: {
  enabled: boolean;
  resetKey: string;
  organisationId: string;
  companyId: string;
  areaText: string;
  tripDate: string | null;
  /** Undefined while the existing line price is still loading. */
  existingUnitPrice: number | null | undefined;
  overrideAmount?: number | null;
}) {
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const adoptSuggestion = useRef(false);
  const initedFor = useRef<string | null>(null);
  const initialRoute = useRef<string | null>(null);
  const routeKey = `${options.companyId}|${options.areaText.trim()}`;

  const suggestionQuery = useQuery({
    queryKey: [
      "suggest-trip-price",
      options.organisationId,
      options.companyId,
      options.areaText,
      options.tripDate ?? "",
    ],
    queryFn: () =>
      suggestTripUnitPrice({
        organisationId: options.organisationId,
        companyId: options.companyId,
        areaText: options.areaText,
        tripDate: options.tripDate,
      }),
    enabled:
      options.enabled &&
      Boolean(options.organisationId && options.companyId && options.areaText.trim()),
  });

  const suggestion = suggestionQuery.data ?? null;

  useEffect(() => {
    if (!options.enabled) {
      initedFor.current = null;
      initialRoute.current = null;
      adoptSuggestion.current = false;
    }
  }, [options.enabled]);

  useEffect(() => {
    if (!options.enabled || !options.resetKey) return;
    if (options.existingUnitPrice === undefined) return;
    if (initedFor.current === options.resetKey) return;
    initedFor.current = options.resetKey;
    initialRoute.current = routeKey;
    setDirty(false);
    const starting =
      options.overrideAmount != null
        ? options.overrideAmount
        : options.existingUnitPrice != null
          ? options.existingUnitPrice
          : null;
    adoptSuggestion.current = starting == null;
    setValue(starting != null ? String(starting) : "");
  }, [
    options.enabled,
    options.resetKey,
    options.existingUnitPrice,
    options.overrideAmount,
    routeKey,
  ]);

  useEffect(() => {
    if (!options.enabled || initialRoute.current == null) return;
    if (initialRoute.current !== routeKey) {
      initialRoute.current = routeKey;
      setDirty(false);
      adoptSuggestion.current = true;
    }
  }, [options.enabled, routeKey]);

  useEffect(() => {
    if (!options.enabled || dirty || !suggestion || suggestion.unitAmount == null) return;
    if (!adoptSuggestion.current && value !== "") return;
    setValue(String(suggestion.unitAmount));
    adoptSuggestion.current = false;
  }, [options.enabled, dirty, suggestion, value]);

  const routeChanged =
    initialRoute.current != null && initialRoute.current !== routeKey;

  const apply: TripPriceApply = tripPriceApplyArgs({
    entered: value,
    suggestion: suggestion?.unitAmount ?? null,
    overrideAmount: options.overrideAmount ?? null,
    existingUnitPrice: options.existingUnitPrice ?? null,
    routeChanged,
  });

  return {
    value,
    onChange: (next: string) => {
      setDirty(true);
      adoptSuggestion.current = false;
      setValue(next);
    },
    suggestion,
    hint: tripPriceHint(suggestion, suggestionQuery.isFetching),
    apply,
  };
}
