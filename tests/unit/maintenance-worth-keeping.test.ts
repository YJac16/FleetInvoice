import { beforeEach, describe, expect, it, vi } from "vitest";

import { contribution, parseOwner, parsePeriod, verdictFor } from "@/features/maintenance/lib/worth-keeping";

describe("Keep / Review / No activity", () => {
  it("Review when contribution is negative", () => {
    expect(verdictFor({ revenue: 1000, bills: 800, fuel: 300 })).toBe("review");
  });
  it("Review when no revenue but cost", () => {
    expect(verdictFor({ revenue: 0, bills: 0, fuel: 50 })).toBe("review");
  });
  it("No activity when both are zero", () => {
    expect(verdictFor({ revenue: 0, bills: 0, fuel: 0 })).toBe("no_activity");
  });
  it("Keep otherwise, including break-even", () => {
    expect(verdictFor({ revenue: 1000, bills: 400, fuel: 600 })).toBe("keep");
    expect(verdictFor({ revenue: 1000, bills: 0, fuel: 0 })).toBe("keep");
    expect(contribution({ revenue: 1000, bills: 400.1, fuel: 600 })).toBe(-0.1);
  });
  it("parses filters with safe defaults", () => {
    expect(parsePeriod(undefined)).toBe(3);
    expect(parsePeriod("6")).toBe(6);
    expect(parsePeriod("99")).toBe(3);
    expect(parseOwner("fadia")).toBe("fadia");
    expect(parseOwner("bob")).toBe("all");
  });
});

const access = vi.hoisted(() => ({ result: null as unknown, roles: [] as string[] }));
vi.mock("@/lib/auth/module-access", () => ({
  assertModuleAccess: vi.fn(async () => access.result),
  getSessionUserId: vi.fn(),
  isOrgEntitledTo: vi.fn(),
}));

import { assertMaintenanceAdminAccess } from "@/lib/auth/maintenance-access";

function granted(isPlatformOwner: boolean) {
  const b = {
    select: () => b,
    eq: () => b,
    then: (r: (v: unknown) => unknown) =>
      Promise.resolve({ data: access.roles.map((role) => ({ role })), error: null }).then(r),
  };
  return {
    ok: true,
    module: "maintenance",
    userId: "u1",
    organisationId: "o1",
    isPlatformOwner,
    admin: { from: () => b },
  };
}

describe("Worth keeping is admin-only", () => {
  beforeEach(() => {
    access.roles = [];
  });
  it("allows organisation_admin", async () => {
    access.result = granted(false);
    access.roles = ["organisation_admin"];
    expect((await assertMaintenanceAdminAccess({ organisationId: "o1", userId: "u1" })).ok).toBe(true);
  });
  it("allows the platform owner without a membership", async () => {
    access.result = granted(true);
    expect((await assertMaintenanceAdminAccess({ organisationId: "o1", userId: "u1" })).ok).toBe(true);
  });
  it("refuses a manager", async () => {
    access.result = granted(false);
    access.roles = ["manager"];
    const r = await assertMaintenanceAdminAccess({ organisationId: "o1", userId: "u1" });
    expect(r.ok).toBe(false);
  });
  it("passes through module denials", async () => {
    access.result = { ok: false, status: 403, error: "forbidden", notMember: true };
    const r = await assertMaintenanceAdminAccess({ organisationId: "o1", userId: "u1" });
    expect(r.ok).toBe(false);
  });
});

describe("worth keeping revenue query", () => {
  it("names the invoice_lines.trip_id FK (00097 added voided_trip_id, a second FK to trips)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("features/maintenance/lib/insights-queries.ts", "utf8");
    expect(src).toContain("trip:trips!invoice_lines_trip_id_fkey!inner(");
    expect(src).not.toMatch(/trip:trips!inner\(/);
    // trips has no vehicle_id column; the vehicle comes from trip_assignments.
    expect(src).toContain("trip_assignments(vehicle_id, released_at, deleted_at)");
  });
  it("takes the vehicle from the active assignment only", async () => {
    const { tripVehicleId } = await import("@/features/maintenance/lib/worth-keeping");
    expect(
      tripVehicleId([
        { vehicle_id: "old", released_at: "2026-11-01", deleted_at: null },
        { vehicle_id: "gone", released_at: null, deleted_at: "2026-11-02" },
        { vehicle_id: "v1", released_at: null, deleted_at: null },
      ])
    ).toBe("v1");
    expect(tripVehicleId([])).toBeNull();
    expect(tripVehicleId(null)).toBeNull();
  });
});
