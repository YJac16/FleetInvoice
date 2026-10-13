import { describe, expect, it } from "vitest";

import { resolveTripsListEmptyState } from "@/features/trips/lib/trips-empty-state";

describe("resolveTripsListEmptyState", () => {
  it("uses range empty copy whenever a date filter applies and org has trips", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgTripCountStatus: "ready",
      orgHasAnyTrips: true,
    });
    expect(state.title).toBe("No trips in this range");
    expect(state.showGenerateAction).toBe(false);
  });

  it("shows first-time onboarding only when the org has zero trips", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgTripCountStatus: "ready",
      orgHasAnyTrips: false,
    });
    expect(state.title).toBe("No trips yet");
    expect(state.showGenerateAction).toBe(true);
  });

  it("uses range copy while org trip count is loading", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgTripCountStatus: "loading",
    });
    expect(state.title).toBe("No trips in this range");
    expect(state.showGenerateAction).toBe(false);
  });

  it("uses range copy when org trip count fails", () => {
    const state = resolveTripsListEmptyState({
      hasSearchFilter: false,
      orgTripCountStatus: "error",
    });
    expect(state.title).toBe("No trips in this range");
    expect(state.showGenerateAction).toBe(false);
  });
});
