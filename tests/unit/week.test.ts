import { describe, expect, it } from "vitest";

import {
  isFilledAtInWeek,
  mondayOfWeek,
  weekPeriodEnd,
} from "@/features/invoices/lib/week";

describe("invoice week window", () => {
  it("resolves Monday for mid-week dates (UTC)", () => {
    // Wednesday 2026-07-22 → Monday 2026-07-20
    expect(mondayOfWeek(new Date("2026-07-22T12:00:00Z"))).toBe("2026-07-20");
  });

  it("treats Sunday as end of prior Monday week", () => {
    // Sunday 2026-07-26 → Monday 2026-07-20
    expect(mondayOfWeek(new Date("2026-07-26T12:00:00Z"))).toBe("2026-07-20");
  });

  it("period end is week_start + 7 days exclusive", () => {
    expect(weekPeriodEnd("2026-07-20")).toBe("2026-07-27");
  });

  it("includes filled_at at week start and excludes week end", () => {
    expect(
      isFilledAtInWeek("2026-07-20T00:00:00.000Z", "2026-07-20")
    ).toBe(true);
    expect(
      isFilledAtInWeek("2026-07-26T23:59:59.000Z", "2026-07-20")
    ).toBe(true);
    expect(
      isFilledAtInWeek("2026-07-27T00:00:00.000Z", "2026-07-20")
    ).toBe(false);
  });
});
