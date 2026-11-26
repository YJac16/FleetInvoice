import { describe, expect, it, vi } from "vitest";

import { buildOpsReport } from "@/services/reports.service";
import type { OwnerLookup } from "@/features/reports/lib/owner-split";

const { listTrips } = vi.hoisted(() => ({ listTrips: vi.fn() }));
vi.mock("@/services/trips.service", () => ({ listTrips }));

const lookup: OwnerLookup = {
  drivers: new Map([["d1", "yaseen"]]),
  vehicles: new Map(),
  driverNames: new Map([["d1", "Shaheed Demo"]]),
} as unknown as OwnerLookup;

describe("trips report Route and Driver", () => {
  it("labels staff waybills and fills Driver", async () => {
    listTrips.mockResolvedValue([
      {
        id: "t1",
        planned_start: "2026-11-25T10:00:00Z",
        status: "completed",
        is_staff_transport: true,
        companies: { name: "Demo Coastline" },
        routes: null,
        trip_assignments: [{ driver_id: "d1", vehicle_id: null, released_at: null }],
      },
      {
        id: "t2",
        planned_start: "2026-11-25T11:00:00Z",
        status: "planned",
        routes: { name: "Airport run" },
        trip_assignments: [],
      },
    ]);
    const report = await buildOpsReport(
      "org",
      "trips",
      { periodStart: "2026-11-23", periodEnd: "2026-11-30" },
      { ownerLookup: lookup, actorNames: new Map() }
    );
    if (report.type !== "trips") throw new Error("wrong report");
    const byId = Object.fromEntries(report.rows.map((r) => [r.id, r]));
    expect(byId.t1.route).toBe("Staff waybill · Demo Coastline");
    expect(byId.t1.driver).toBe("Shaheed Demo");
    expect(byId.t2.route).toBe("Airport run");
    expect(byId.t2.driver).toBe("");
  });
});
