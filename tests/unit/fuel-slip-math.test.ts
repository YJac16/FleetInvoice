import { describe, expect, it } from "vitest";

import {
  amountMismatchDetails,
  calculatedTotal,
  isAmountMismatch,
} from "@/features/fuel/lib/slip-math";

describe("fuel slip amount maths", () => {
  const defaults = { amountTolAbs: 1.0, amountTolPct: 0.25 };

  it("matches sample TOTAL Woodstock slip (951.09 vs 951.10, no flag)", () => {
    expect(calculatedTotal(36.51, 26.05)).toBe(951.09);
    expect(isAmountMismatch(36.51, 26.05, 951.1, defaults)).toBe(false);
  });

  it("flags when outside tolerance", () => {
    expect(isAmountMismatch(36.51, 26.05, 900, defaults)).toBe(true);
  });

  it("stores tolerance inputs in details", () => {
    const d = amountMismatchDetails(36.51, 26.05, 951.1, defaults);
    expect(d.calculated_total).toBe(951.09);
    expect(d.typed_total).toBe(951.1);
    expect(d.tol_abs).toBe(1);
    expect(d.tol_pct).toBe(0.25);
  });
});
