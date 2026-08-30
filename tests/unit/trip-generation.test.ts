import { describe, expect, it } from "vitest";

import {
  buildGenerationKey,
  buildPlannedStart,
  buildTripOccurrences,
  computeOccurrenceDates,
} from "@/features/trips/lib/generate";

describe("computeOccurrenceDates", () => {
  it("returns each Monday and Wednesday within a week range", () => {
    // 2026-07-20 is a Monday; 2026-07-26 is the following Sunday.
    const dates = computeOccurrenceDates("2026-07-20", "2026-07-26", [1, 3]);
    expect(dates).toEqual(["2026-07-20", "2026-07-22"]);
    expect(dates).toHaveLength(2);
  });

  it("returns an empty list when no weekday matches", () => {
    expect(computeOccurrenceDates("2026-07-20", "2026-07-26", [])).toEqual([]);
  });

  it("includes both range endpoints when they match", () => {
    // 2026-07-19 (Sun) .. 2026-07-25 (Sat): Sunday and Saturday are the ends.
    const dates = computeOccurrenceDates("2026-07-19", "2026-07-25", [0, 6]);
    expect(dates).toEqual(["2026-07-19", "2026-07-25"]);
  });
});

describe("buildPlannedStart", () => {
  it("combines a date and HH:MM:SS depart time into an ISO timestamp", () => {
    expect(buildPlannedStart("2026-07-20", "08:30:00")).toBe(
      "2026-07-20T08:30:00.000Z"
    );
  });

  it("pads HH:MM depart times with seconds", () => {
    expect(buildPlannedStart("2026-07-20", "08:30")).toBe(
      "2026-07-20T08:30:00.000Z"
    );
  });
});

describe("buildGenerationKey", () => {
  it("formats as `${scheduleId}:${isoStart}` without milliseconds (matches SQL RPC)", () => {
    const plannedStart = buildPlannedStart("2026-07-20", "08:30:00");
    expect(buildGenerationKey("schedule-1", plannedStart)).toBe(
      "schedule-1:2026-07-20T08:30:00Z"
    );
  });
});

describe("buildTripOccurrences", () => {
  it("expands a Mon/Wed schedule over a week into two dedupe-keyed trips", () => {
    const occurrences = buildTripOccurrences({
      organisationId: "org-1",
      routeId: "route-1",
      scheduleId: "schedule-1",
      companyId: null,
      from: "2026-07-20",
      to: "2026-07-26",
      daysOfWeek: [1, 3],
      departTime: "08:30",
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toMatchObject({
      organisation_id: "org-1",
      route_id: "route-1",
      schedule_id: "schedule-1",
      company_id: null,
      status: "planned",
      planned_start: "2026-07-20T08:30:00.000Z",
      generation_key: "schedule-1:2026-07-20T08:30:00Z",
    });
    expect(occurrences[1].planned_start).toBe("2026-07-22T08:30:00.000Z");
    expect(occurrences[1].generation_key).toBe(
      "schedule-1:2026-07-22T08:30:00Z"
    );
  });
});
