import { describe, expect, it } from "vitest";

import { resolveDateRange } from "@/lib/date-range/sast-range";
import {
  invoicePeriodOverlapBoundsForRange,
  periodStartBoundsForRange,
  plannedStartBoundsForRange,
} from "@/lib/date-range/supabase-bounds";

describe("supabase date bounds", () => {
  it("maps SAST planned_start half-open interval", () => {
    const range = resolveDateRange(
      "today",
      null,
      null,
      new Date("2026-10-12T12:00:00+02:00")
    );
    expect(plannedStartBoundsForRange(range)).toEqual({
      gte: "2026-10-12T00:00:00+02:00",
      lt: "2026-10-13T00:00:00+02:00",
    });
  });

  it("maps inclusive period_start dates", () => {
    const range = resolveDateRange("this_week", null, null, new Date("2026-10-07T12:00:00+02:00"));
    expect(periodStartBoundsForRange(range)).toEqual({
      gte: "2026-10-05",
      lte: "2026-10-11",
    });
  });

  it("maps invoice overlap (period_start <= to AND period_end >= from)", () => {
    const range = resolveDateRange("this_week", null, null, new Date("2026-10-07T12:00:00+02:00"));
    expect(invoicePeriodOverlapBoundsForRange(range)).toEqual({
      periodEndGte: "2026-10-05",
      periodStartLte: "2026-10-11",
    });
  });
});
