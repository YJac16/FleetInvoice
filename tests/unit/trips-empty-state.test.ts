import { describe, expect, it } from "vitest";

import { resolveTripsListEmptyState } from "@/features/trips/lib/trips-empty-state";

describe("resolveTripsListEmptyState", () => {
  it("uses range empty copy whenever a date filter applies and org has trips", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgHasAnyTrips: true,
    });
    expect(state.title).toBe("No trips in this range");
    expect(state.showGenerateAction).toBe(false);
  });

  it("shows first-time onboarding only when the org has zero trips", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgHasAnyTrips: false,
    });
    expect(state.title).toBe("No trips yet");
    expect(state.showGenerateAction).toBe(true);
  });

  it("defaults to range copy while org trip count is unknown", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgHasAnyTrips: undefined,
    });
    expect(state.title).toBe("No trips in this range");
  });
});
