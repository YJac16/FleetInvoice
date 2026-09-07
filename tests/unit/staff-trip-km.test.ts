import { describe, expect, it } from "vitest";

import {
  assertKmOrder,
  calcTotalKm,
} from "@/features/driver-portal/lib/km";

describe("staff trip km", () => {
  it("calculates total km as closing minus opening", () => {
    expect(calcTotalKm(100, 128.4)).toBe(28.4);
  });

  it("returns null when readings missing", () => {
    expect(calcTotalKm(null, 100)).toBeNull();
    expect(calcTotalKm(100, null)).toBeNull();
  });

  it("rejects closing below opening", () => {
    expect(calcTotalKm(200, 150)).toBeNull();
    expect(() => assertKmOrder(200, 150)).toThrow(/closing km/i);
  });
});
