import { describe, expect, it } from "vitest";

import {
  activeStaffTripForGps,
  boundsFromCoordinates,
  pathCoordinatesFromGpsPoints,
  shouldShareStaffTripGps,
  staffTripLiveMarkers,
} from "@/features/driver-portal/lib/gps";
import type { GpsLastPosition, GpsPoint, StaffTrip } from "@/types";

function trip(
  overrides: Partial<StaffTrip> & Pick<StaffTrip, "id" | "status">
): StaffTrip {
  return {
    organisation_id: "org-1",
    planned_start: "2026-09-07T08:00:00Z",
    is_staff_transport: true,
    staff_company: "amazon",
    area_text: "Century City",
    pax_count: 4,
    opening_km: null,
    closing_km: null,
    total_km: null,
    trip_assignments: [],
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...overrides,
  } as StaffTrip;
}

describe("shouldShareStaffTripGps", () => {
  it("allows en-route pickup and company only", () => {
    expect(shouldShareStaffTripGps("en_route_pickup")).toBe(true);
    expect(shouldShareStaffTripGps("en_route_company")).toBe(true);
  });

  it("blocks assigned, completed, and cancelled", () => {
    expect(shouldShareStaffTripGps("assigned")).toBe(false);
    expect(shouldShareStaffTripGps("completed")).toBe(false);
    expect(shouldShareStaffTripGps("cancelled")).toBe(false);
  });
});

describe("activeStaffTripForGps", () => {
  it("returns first en-route trip", () => {
    const trips = [
      trip({ id: "a", status: "assigned" }),
      trip({ id: "b", status: "en_route_pickup" }),
    ];
    expect(activeStaffTripForGps(trips)?.id).toBe("b");
  });
});

describe("pathCoordinatesFromGpsPoints", () => {
  it("maps to lng/lat pairs in order", () => {
    const points: GpsPoint[] = [
      {
        id: "1",
        organisation_id: "o",
        driver_id: "d",
        vehicle_id: null,
        trip_id: "t",
        latitude: -26.1,
        longitude: 28.0,
        accuracy_m: 10,
        recorded_at: "2026-09-07T08:00:00Z",
        created_at: "",
      },
      {
        id: "2",
        organisation_id: "o",
        driver_id: "d",
        vehicle_id: null,
        trip_id: "t",
        latitude: -26.2,
        longitude: 28.1,
        accuracy_m: 10,
        recorded_at: "2026-09-07T08:05:00Z",
        created_at: "",
      },
    ];
    expect(pathCoordinatesFromGpsPoints(points)).toEqual([
      [28.0, -26.1],
      [28.1, -26.2],
    ]);
  });
});

describe("boundsFromCoordinates", () => {
  it("returns null for empty input", () => {
    expect(boundsFromCoordinates([])).toBeNull();
  });

  it("computes southwest and northeast corners", () => {
    expect(
      boundsFromCoordinates([
        [28.0, -26.1],
        [28.2, -26.3],
      ])
    ).toEqual([
      [28.0, -26.3],
      [28.2, -26.1],
    ]);
  });
});

describe("staffTripLiveMarkers", () => {
  it("includes positions tied to en-route staff trips", () => {
    const trips = [
      trip({
        id: "trip-1",
        status: "en_route_company",
        trip_assignments: [
          {
            id: "ta-1",
            trip_id: "trip-1",
            driver_id: "driver-1",
            released_at: null,
            drivers: { id: "driver-1", full_name: "Sam" },
          },
        ] as StaffTrip["trip_assignments"],
      }),
    ];
    const positions: GpsLastPosition[] = [
      {
        organisation_id: "org-1",
        driver_id: "driver-1",
        vehicle_id: null,
        trip_id: "trip-1",
        latitude: -26.2,
        longitude: 28.0,
        accuracy_m: 5,
        recorded_at: "2026-09-07T08:00:00Z",
        updated_at: "",
        drivers: { id: "driver-1", full_name: "Sam" },
      },
    ];

    const markers = staffTripLiveMarkers(trips, positions);
    expect(markers).toHaveLength(1);
    expect(markers[0].label).toBe("Sam");
  });

  it("excludes drivers not on en-route trips", () => {
    const trips = [trip({ id: "trip-1", status: "assigned" })];
    const positions: GpsLastPosition[] = [
      {
        organisation_id: "org-1",
        driver_id: "driver-2",
        vehicle_id: null,
        trip_id: "trip-1",
        latitude: -26.2,
        longitude: 28.0,
        accuracy_m: 5,
        recorded_at: "2026-09-07T08:00:00Z",
        updated_at: "",
      },
    ];
    expect(staffTripLiveMarkers(trips, positions)).toHaveLength(0);
  });
});
