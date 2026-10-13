import { describe, expect, it } from "vitest";

import {
  formatVehicleOptionLabel,
  resolveDefaultVehicleIdForDriver,
  shouldApplyDriverDefaultVehicle,
  validateStaffWaybillSubmit,
} from "@/features/trips/lib/staff-waybill-form";

const orgVehicles = new Set(["veh-1", "veh-2"]);

const baseValues = {
  driverId: "driver-1",
  date: "2026-10-05",
  time: "08:00",
  companyId: "a0000000-0000-4000-8000-000000000001",
  areaText: "CBD",
  paxCount: 1,
  vehicleId: "",
  openingKm: "",
  closingKm: "",
};

describe("validateStaffWaybillSubmit", () => {
  it("requires vehicle for backfill", () => {
    expect(
      validateStaffWaybillSubmit("backfill", baseValues, orgVehicles)
    ).toEqual({ ok: false, message: "Select a vehicle" });
  });

  it("rejects vehicle outside organisation on backfill", () => {
    expect(
      validateStaffWaybillSubmit(
        "backfill",
        { ...baseValues, vehicleId: "other-org-veh" },
        orgVehicles
      )
    ).toEqual({
      ok: false,
      message: "Vehicle must belong to this organisation",
    });
  });

  it("accepts valid backfill with org vehicle", () => {
    expect(
      validateStaffWaybillSubmit(
        "backfill",
        { ...baseValues, vehicleId: "veh-1" },
        orgVehicles
      )
    ).toEqual({ ok: true });
  });

  it("allows send without vehicle (server defaults)", () => {
    expect(
      validateStaffWaybillSubmit("send", baseValues, orgVehicles)
    ).toEqual({ ok: true });
  });
});

describe("shouldApplyDriverDefaultVehicle", () => {
  it("skips when the admin already chose a vehicle", () => {
    expect(
      shouldApplyDriverDefaultVehicle({
        vehicleFieldTouched: true,
        currentVehicleId: "veh-1",
        driverChanged: false,
      })
    ).toBe(false);
  });

  it("skips when the field has a value and the driver did not change", () => {
    expect(
      shouldApplyDriverDefaultVehicle({
        vehicleFieldTouched: false,
        currentVehicleId: "veh-2",
        driverChanged: false,
      })
    ).toBe(false);
  });

  it("applies when the driver changed and the field is empty", () => {
    expect(
      shouldApplyDriverDefaultVehicle({
        vehicleFieldTouched: false,
        currentVehicleId: "",
        driverChanged: true,
      })
    ).toBe(true);
  });

  it("applies when assignments load and the field is still empty", () => {
    expect(
      shouldApplyDriverDefaultVehicle({
        vehicleFieldTouched: false,
        currentVehicleId: "",
        driverChanged: false,
      })
    ).toBe(true);
  });
});

describe("resolveDefaultVehicleIdForDriver", () => {
  it("returns linked vehicle when present", () => {
    const map = new Map([["driver-1", "veh-2"]]);
    expect(resolveDefaultVehicleIdForDriver("driver-1", map)).toBe("veh-2");
  });

  it("returns empty when driver has no assignment", () => {
    expect(resolveDefaultVehicleIdForDriver("driver-1", new Map())).toBe("");
  });
});

describe("formatVehicleOptionLabel", () => {
  it("prefers registration over name", () => {
    expect(formatVehicleOptionLabel("GR11-WP", "Toyota")).toBe("GR11-WP");
  });
});
