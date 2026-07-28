import { describe, expect, it } from "vitest";

import {
  geofenceTransition,
  haversineMetres,
  isInsideRadius,
} from "@/features/dispatch/lib/geofence";

describe("haversineMetres", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineMetres(-26.2, 28.0, -26.2, 28.0)).toBeLessThan(1);
  });

  it("measures roughly 111km for 1 degree latitude", () => {
    const d = haversineMetres(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("isInsideRadius", () => {
  it("detects points inside a circular fence", () => {
    expect(isInsideRadius(-26.2041, 28.0473, -26.2041, 28.0473, 100)).toBe(true);
  });

  it("detects points outside a small fence", () => {
    expect(isInsideRadius(-26.21, 28.05, -26.2041, 28.0473, 50)).toBe(false);
  });
});

describe("geofenceTransition", () => {
  it("returns null when previous state unknown", () => {
    expect(geofenceTransition(null, true)).toBeNull();
  });

  it("returns enter when moving outside → inside", () => {
    expect(geofenceTransition(false, true)).toBe("enter");
  });

  it("returns exit when moving inside → outside", () => {
    expect(geofenceTransition(true, false)).toBe("exit");
  });

  it("returns null when state unchanged", () => {
    expect(geofenceTransition(true, true)).toBeNull();
    expect(geofenceTransition(false, false)).toBeNull();
  });
});
