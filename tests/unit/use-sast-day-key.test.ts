import { describe, expect, it } from "vitest";

import { driverTodayStaffTripRange } from "@/features/driver-portal/lib/driver-today-range";

describe("driver today SAST rollover", () => {
  it("uses a new range when the SAST calendar day changes", () => {
    const dayOne = driverTodayStaffTripRange(new Date("2026-10-14T23:30:00+02:00"));
    const dayTwo = driverTodayStaffTripRange(new Date("2026-10-15T00:30:00+02:00"));
    expect(dayOne.from).toBe("2026-10-14");
    expect(dayTwo.from).toBe("2026-10-15");
    expect(dayOne.from).not.toBe(dayTwo.from);
  });
});
