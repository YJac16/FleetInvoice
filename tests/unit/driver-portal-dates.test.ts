import { describe, expect, it } from "vitest";

import {
  daysOfWeek,
  isTodayDate,
  mondayOfWeek,
  todayDateString,
} from "@/features/driver-portal/lib/dates";
import { tripsForDay } from "@/features/driver-portal/lib/trip-labels";
import type { StaffTrip } from "@/types";

describe("driver portal dates", () => {
  it("resolves Monday for a Wednesday", () => {
    expect(mondayOfWeek("2026-09-09")).toBe("2026-09-07");
  });

  it("builds seven day strings from Monday", () => {
    expect(daysOfWeek("2026-09-07")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("filters trips by planned_start day", () => {
    const trips = [
      { planned_start: "2026-09-07T14:00:00+02:00" },
      { planned_start: "2026-09-08T08:00:00+02:00" },
    ] as StaffTrip[];
    expect(tripsForDay(trips, "2026-09-07")).toHaveLength(1);
  });
});

describe("todayDateString", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("isTodayDate matches today string", () => {
    expect(isTodayDate(todayDateString())).toBe(true);
    expect(isTodayDate("1999-01-01")).toBe(false);
  });
});
