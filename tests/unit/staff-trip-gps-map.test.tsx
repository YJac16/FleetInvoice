import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_MAPBOX_TOKEN: "pk.test" },
  isMapboxConfigured: () => true,
}));
const createMapboxMap = vi.fn();
vi.mock("@/lib/maps/mapbox", () => ({
  createMapboxMap: (...args: unknown[]) => createMapboxMap(...args),
}));

import {
  StaffTripGpsMap,
  sanitizeMapMarkers,
  sanitizeMapPaths,
} from "@/features/trips/components/staff-trip-gps-map";

describe("StaffTripGpsMap hardening (Monitor page)", () => {
  afterEach(() => {
    cleanup();
    createMapboxMap.mockReset();
  });

  it("drops markers / path points with invalid coordinates", () => {
    expect(
      sanitizeMapMarkers([
        { id: "a", lat: -33.9, lng: 18.4 },
        { id: "b", lat: Number.NaN, lng: 18.4 },
        { id: "c", lat: null as unknown as number, lng: 18.4 },
      ]).map((m) => m.id)
    ).toEqual(["a"]);
    expect(
      sanitizeMapPaths([{ id: "p", coordinates: [[18.4, -33.9], [Number.NaN, -33.9]] }])[0]
        .coordinates
    ).toEqual([[18.4, -33.9]]);
  });

  it("shows a local fallback instead of crashing when the map cannot start (e.g. no WebGL)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createMapboxMap.mockRejectedValue(new Error("Failed to initialize WebGL"));
    render(<StaffTripGpsMap markers={[]} />);
    await waitFor(() =>
      expect(screen.getByText(/Map unavailable in this browser/)).toBeInTheDocument()
    );
  });

  it("keeps map update errors away from React", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createMapboxMap.mockResolvedValue({
      map: {},
      setMarkers: () => {
        throw new Error("Invalid LngLat");
      },
      setPaths: () => undefined,
      fitBounds: () => undefined,
      destroy: () => undefined,
    });
    const { rerender } = render(
      <StaffTripGpsMap markers={[{ id: "a", lat: -33.9, lng: 18.4 }]} emptyMessage="empty" />
    );
    rerender(<StaffTripGpsMap markers={[{ id: "a", lat: -33.8, lng: 18.4 }]} emptyMessage="empty" />);
    await waitFor(() => expect(createMapboxMap).toHaveBeenCalled());
    expect(screen.queryByText(/Map unavailable/)).not.toBeInTheDocument();
  });
});
