export type TripsListEmptyState = {
  title: string;
  description: string;
  showGenerateAction: boolean;
};

/** Copy for trips list when the ranged query returned no rows (client search excluded). */
export function resolveTripsListEmptyState({
  hasSearchFilter,
  orgHasAnyTrips,
}: {
  hasSearchFilter: boolean;
  /** `undefined` while the org-wide head count is still loading. */
  orgHasAnyTrips: boolean | undefined;
}): TripsListEmptyState {
  if (hasSearchFilter) {
    return {
      title: "No trips in this range",
      description: "Try a different date range or clear your search.",
      showGenerateAction: false,
    };
  }

  if (orgHasAnyTrips === false) {
    return {
      title: "No trips yet",
      description: "Generate trips from a schedule to see them here.",
      showGenerateAction: true,
    };
  }

  return {
    title: "No trips in this range",
    description: "Try a different date range or clear your search.",
    showGenerateAction: false,
  };
}
