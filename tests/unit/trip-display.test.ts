import { describe, expect, it } from "vitest";

import {
  tripAreaLabel,
  tripCompanyLabel,
  tripRouteLabel,
} from "@/features/trips/lib/trip-display";

const staffWaybill = {
  is_staff_transport: true,
  routes: null,
  service_locations: null,
  area_text: "TEST TRIP – delete (Cape Town CBD → Bellville)",
  staff_company: null,
  companies: { name: "Acme Logistics" },
};

describe("trip display labels (admin Trips list)", () => {
  it("shows the Create waybill area text in AREA for staff waybills", () => {
    expect(tripAreaLabel(staffWaybill)).toBe(
      "TEST TRIP – delete (Cape Town CBD → Bellville)"
    );
  });

  it("shows 'Staff waybill · company' in Route for staff waybills (no route)", () => {
    expect(tripRouteLabel(staffWaybill)).toBe("Staff waybill · Acme Logistics");
    expect(tripRouteLabel({ ...staffWaybill, companies: null })).toBe("Staff waybill");
  });

  it("keeps scheduled-trip behaviour: route name, service_locations first in AREA", () => {
    const scheduled = {
      is_staff_transport: false,
      routes: { name: "Route 7" },
      service_locations: "Bellville; Parow",
      area_text: null,
    };
    expect(tripRouteLabel(scheduled)).toBe("Route 7");
    expect(tripAreaLabel(scheduled)).toBe("Bellville; Parow");
    expect(tripAreaLabel({ ...scheduled, service_locations: "  " })).toBe("Route 7");
  });

  it("falls back to an em dash when nothing is set", () => {
    expect(tripRouteLabel({})).toBe("—");
    expect(tripAreaLabel({})).toBe("—");
  });

  it("company label prefers joined company, then legacy staff_company enum", () => {
    expect(tripCompanyLabel(staffWaybill)).toBe("Acme Logistics");
    expect(
      tripCompanyLabel({ companies: null, staff_company: "teleperformance" })
    ).toBe("Teleperformance");
    expect(tripCompanyLabel({ companies: null, staff_company: null })).toBeNull();
  });
});
