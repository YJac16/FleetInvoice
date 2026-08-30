import { describe, expect, it } from "vitest";

import {
  assertOdometerMonotonic,
  isOdometerAllowed,
  kmSinceLastFill,
  litresPer100Km,
} from "@/features/fuel/lib/odometer";

describe("odometer rules", () => {
  it("allows first fill with non-negative odometer", () => {
    expect(isOdometerAllowed(0, null)).toBe(true);
    expect(isOdometerAllowed(1200.5, undefined)).toBe(true);
  });

  it("rejects decrease below last fill", () => {
    expect(isOdometerAllowed(99, 100)).toBe(false);
    expect(() => assertOdometerMonotonic(99, 100)).toThrow(/less than last/);
  });

  it("allows equal or higher than last fill", () => {
    expect(isOdometerAllowed(100, 100)).toBe(true);
    expect(isOdometerAllowed(150, 100)).toBe(true);
    expect(() => assertOdometerMonotonic(150, 100)).not.toThrow();
  });

  it("rejects negative odometer", () => {
    expect(isOdometerAllowed(-1, null)).toBe(false);
    expect(() => assertOdometerMonotonic(-1, null)).toThrow(/non-negative/);
  });

  it("computes km since last fill and L/100km", () => {
    expect(kmSinceLastFill(1100, 1000)).toBe(100);
    expect(kmSinceLastFill(1100, null)).toBeNull();
    expect(litresPer100Km(10, 1100, 1000)).toBe(10);
    expect(litresPer100Km(10, 1000, 1000)).toBeNull();
  });
});
