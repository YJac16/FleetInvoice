import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  countTripsPerDriver,
  summariseVehicleDue,
  sumIssuedInvoices,
} from "@/features/dashboard/lib/summary";

const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
let tableRows: Record<string, unknown[]> = {};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const call = { table, eq: [] as Array<[string, unknown]> };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (call.eq.push([c, v]), chain),
        is: () => chain,
        gte: () => chain,
        lt: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: tableRows[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

const renewals = vi.fn();
vi.mock("@/services/compliance.service", () => ({
  listComplianceRenewals: (...a: unknown[]) => renewals(...a),
}));

import { getDashboardSummary } from "@/services/dashboard.service";

beforeEach(() => {
  calls.length = 0;
  tableRows = {};
  renewals.mockReset().mockResolvedValue([]);
});

describe("dashboard summary aggregation", () => {
  it("totals issued invoices", () => {
    expect(sumIssuedInvoices([{ total: 100 }, { total: "250.5" }, { total: null }])).toEqual({
      count: 3,
      total: 350.5,
    });
  });

  it("splits overdue from due soon and ignores driver papers", () => {
    const row = (subject_kind: string, days_remaining: number) =>
      ({ subject_kind, days_remaining }) as never;
    expect(
      summariseVehicleDue([
        row("vehicle_disc", -3),
        row("vehicle_permit", 10),
        row("driver_license", -1),
      ])
    ).toEqual({ overdue: 1, dueSoon: 1 });
    expect(summariseVehicleDue([row("driver_license", 5)])).toBeNull();
  });

  it("counts active assignments per driver, busiest first, skipping cancelled", () => {
    const a = (id: string, name: string, released: string | null = null) => ({
      driver_id: id,
      released_at: released,
      drivers: { full_name: name },
    });
    expect(
      countTripsPerDriver([
        { status: "assigned", trip_assignments: [a("d1", "Zed")] },
        { status: "completed", trip_assignments: [a("d2", "Amy")] },
        { status: "completed", trip_assignments: [a("d2", "Amy")] },
        { status: "cancelled", trip_assignments: [a("d1", "Zed")] },
        { status: "planned", trip_assignments: [a("d1", "Zed", "2026-11-24T00:00:00Z")] },
        { status: "planned", trip_assignments: [] },
      ])
    ).toEqual([
      { driverId: "d2", name: "Amy", trips: 2 },
      { driverId: "d1", name: "Zed", trips: 1 },
    ]);
  });
});

describe("getDashboardSummary access", () => {
  it("never queries invoices or money for a viewer without invoices access", async () => {
    tableRows = { trips: [] };
    const out = await getDashboardSummary("org-1", {
      invoices: false,
      vehicles: true,
      trips: true,
    });
    expect(out.invoices).toBeNull();
    expect(calls.map((c) => c.table)).not.toContain("invoices");
  });

  it("runs nothing when the viewer has no access", async () => {
    const out = await getDashboardSummary("org-1", {
      invoices: false,
      vehicles: false,
      trips: false,
    });
    expect(out).toEqual({
      invoices: null,
      invoiceStatusTotals: null,
      maintenanceCosts: null,
      vehiclesDue: null,
      driverTrips: null,
    });
    expect(calls).toHaveLength(0);
    expect(renewals).not.toHaveBeenCalled();
  });

  it("scopes every query to the organisation", async () => {
    tableRows = { invoices: [{ total: 10 }], trips: [] };
    renewals.mockResolvedValue([{ subject_kind: "vehicle_disc", days_remaining: -1 }]);
    const out = await getDashboardSummary("org-9", {
      invoices: true,
      vehicles: true,
      trips: true,
    });
    expect(out.invoices).toEqual({ count: 1, total: 10 });
    expect(out.vehiclesDue).toEqual({ overdue: 1, dueSoon: 0 });
    expect(renewals).toHaveBeenCalledWith("org-9", 30);
    for (const c of calls) expect(c.eq).toContainEqual(["organisation_id", "org-9"]);
    expect(calls.find((c) => c.table === "invoices")?.eq).toContainEqual(["status", "issued"]);
  });
});

describe("money visuals access", () => {
  it("reads workshop bills only with maintenanceCosts access, never invoices without invoices access", async () => {
    tableRows = { workshop_bills: [{ bill_date: "2026-11-02", total_incl: 40 }] };
    const none = await getDashboardSummary("org-1", { invoices: false, vehicles: false, trips: false });
    expect(none.maintenanceCosts).toBeNull();
    expect(none.invoiceStatusTotals).toBeNull();
    expect(calls).toHaveLength(0);

    const admin = await getDashboardSummary(
      "org-1",
      { invoices: false, vehicles: false, trips: false, maintenanceCosts: true },
      new Date("2026-11-26T10:00:00Z")
    );
    expect(calls.map((c) => c.table)).toEqual(["workshop_bills"]);
    expect(calls[0].eq).toContainEqual(["organisation_id", "org-1"]);
    expect(calls[0].eq).toContainEqual(["status", "approved"]);
    expect(admin.maintenanceCosts?.at(-1)).toEqual({ month: "2026-11", total: 40 });
    expect(admin.invoiceStatusTotals).toBeNull();
  });
});
