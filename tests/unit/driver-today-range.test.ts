import { describe, expect, it } from "vitest";

import { driverTodayStaffTripRange } from "@/features/driver-portal/lib/driver-today-range";
import { resolveDateRange } from "@/lib/date-range/sast-range";

describe("driverTodayStaffTripRange", () => {
  it("always uses SAST today regardless of URL-style week params", () => {
    const now = new Date("2026-10-14T15:00:00+02:00");
    const today = driverTodayStaffTripRange(now);
    const weekFromUrl = resolveDateRange(
      "this_week",
      null,
      null,
      now
    );

    expect(today.from).toBe("2026-10-14");
    expect(today.toExclusive).toBe("2026-10-15");
    expect(weekFromUrl.from).not.toBe(today.from);
    expect(weekFromUrl.toExclusive).not.toBe(today.toExclusive);
  });
});
