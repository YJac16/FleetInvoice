import { describe, expect, it } from "vitest";

import {
  CUSTOM_RANGE_ORDER_ERROR,
  validateCustomRangeDraft,
} from "@/lib/date-range/custom-range-draft";

describe("validateCustomRangeDraft", () => {
  it("rejects invalid calendar dates", () => {
    const v = validateCustomRangeDraft("31/02/2026", "14/10/2026");
    expect(v.fromIso).toBeNull();
    expect(v.fromInvalid).toBe(true);
    expect(v.canApply).toBe(false);
  });

  it("rejects when end is before start", () => {
    const v = validateCustomRangeDraft("14/10/2026", "01/10/2026");
    expect(v.canApply).toBe(false);
    expect(v.orderError).toBe(CUSTOM_RANGE_ORDER_ERROR);
  });

  it("allows apply when both dates are valid and ordered", () => {
    const v = validateCustomRangeDraft("01/10/2026", "14/10/2026");
    expect(v.canApply).toBe(true);
    expect(v.fromIso).toBe("2026-10-01");
    expect(v.toIso).toBe("2026-10-14");
    expect(v.orderError).toBeNull();
  });
});
