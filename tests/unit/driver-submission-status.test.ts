import { describe, expect, it } from "vitest";

import { driverSubmissionStatus } from "@/services/driver-submitted-trips.service";
import type { StaffTrip } from "@/types";

function trip(partial: Partial<StaffTrip>): StaffTrip {
  return {
    id: "t1",
    organisation_id: "o1",
    route_id: "",
    schedule_id: null,
    company_id: "c1",
    planned_start: "2026-01-01T08:00:00Z",
    planned_end: null,
    status: "planned",
    generation_key: null,
    notes: null,
    service_locations: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    is_staff_transport: true,
    staff_company: null,
    area_text: "A → B",
    pax_count: 1,
    opening_km: null,
    closing_km: null,
    total_km: 10,
    waybill_confirmed_at: null,
    staff_started_at: null,
    staff_completed_at: null,
    submitted_by_driver: true,
    ...partial,
  };
}

describe("driverSubmissionStatus", () => {
  it("classifies pending, approved, and rejected", () => {
    expect(driverSubmissionStatus(trip({}))).toBe("pending");
    expect(driverSubmissionStatus(trip({ approved_at: "2026-01-02T00:00:00Z" }))).toBe(
      "approved"
    );
    expect(driverSubmissionStatus(trip({ rejected_reason: "Duplicate" }))).toBe(
      "rejected"
    );
  });
});
