import { describe, expect, it } from "vitest";

import {
  AREA_RADIUS_MAX_M,
  AREA_RADIUS_MIN_M,
  AREA_RADIUS_POINT_DEFAULT_M,
  clampAreaRadius,
  parseMapboxFeature,
  radiusFromBbox,
} from "@/features/areas/lib/geocode";
import { isVerifiedDestination } from "@/features/areas/lib/destination";
import { circleRing } from "@/features/areas/lib/map-circle";

describe("clampAreaRadius", () => {
  it("clamps below the minimum", () => {
    expect(clampAreaRadius(10)).toBe(AREA_RADIUS_MIN_M);
  });

  it("clamps above the maximum", () => {
    expect(clampAreaRadius(9_000)).toBe(AREA_RADIUS_MAX_M);
  });
});

describe("radiusFromBbox", () => {
  it("uses half the bbox diagonal", () => {
    const r = radiusFromBbox(18.4, -33.93, 18.5, -33.9);
    expect(r).toBeGreaterThanOrEqual(AREA_RADIUS_MIN_M);
    expect(r).toBeLessThanOrEqual(AREA_RADIUS_MAX_M);
  });

  it("falls back to point default via parseMapboxFeature without bbox", () => {
    const place = parseMapboxFeature({
      id: "poi.1",
      text: "V&A Waterfront",
      place_name: "V&A Waterfront, Cape Town",
      center: [18.418, -33.903],
    });
    expect(place?.radiusM).toBe(AREA_RADIUS_POINT_DEFAULT_M);
    expect(place?.lat).toBeCloseTo(-33.903);
  });

  it("rejects features without coordinates", () => {
    expect(parseMapboxFeature({ text: "Nowhere" })).toBeNull();
  });
});

describe("circleRing", () => {
  it("closes the ring", () => {
    const ring = circleRing(18.42, -33.92, 150);
    expect(ring.length).toBeGreaterThan(8);
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0]);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1]);
  });
});

describe("isVerifiedDestination", () => {
  it("requires coordinates", () => {
    expect(
      isVerifiedDestination({ status: "active", lat: null, lng: null })
    ).toBe(false);
    expect(
      isVerifiedDestination({ status: "active", lat: -33.9, lng: 18.4 })
    ).toBe(true);
  });
});
