import { describe, expect, it } from "vitest";

import { formatRangeResultCount } from "@/lib/date-range/result-count-label";

describe("formatRangeResultCount", () => {
  it("uses singular for one result", () => {
    expect(formatRangeResultCount(1, "trip", "trips")).toBe("1 trip");
  });

  it("uses plural for zero and many", () => {
    expect(formatRangeResultCount(0, "invoice", "invoices")).toBe("0 invoices");
    expect(formatRangeResultCount(12, "trip", "trips")).toBe("12 trips");
  });
});
