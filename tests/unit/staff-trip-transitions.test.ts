import { describe, expect, it } from "vitest";

import {
  canAdvanceStaffTrip,
  canEndStaffTrip,
  canStartStaffTrip,
  isActiveStaffTrip,
  staffTripStatusLabel,
} from "@/features/driver-portal/lib/staff-transitions";

describe("staff trip en-route flow", () => {
  it("labels en-route statuses", () => {
    expect(staffTripStatusLabel("en_route_pickup")).toBe("En route to pickup");
    expect(staffTripStatusLabel("en_route_company")).toBe("En route to company");
  });

  it("follows assigned → pickup → company → completed", () => {
    expect(canStartStaffTrip("assigned")).toBe(true);
    expect(canStartStaffTrip("en_route_pickup")).toBe(false);

    expect(canAdvanceStaffTrip("en_route_pickup")).toBe(true);
    expect(canAdvanceStaffTrip("en_route_company")).toBe(false);

    expect(canEndStaffTrip("en_route_company")).toBe(true);
    expect(canEndStaffTrip("en_route_pickup")).toBe(false);
  });

  it("treats en-route as active", () => {
    expect(isActiveStaffTrip("en_route_pickup")).toBe(true);
    expect(isActiveStaffTrip("en_route_company")).toBe(true);
    expect(isActiveStaffTrip("assigned")).toBe(false);
    expect(isActiveStaffTrip("in_progress")).toBe(false);
  });
});
