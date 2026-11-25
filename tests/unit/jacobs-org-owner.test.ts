import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// Fixture data is fake (DEMO-* banks / accounts, @example.com).

vi.mock("@/services/trips.service", () => ({ listTrips: vi.fn() }));
vi.mock("@/services/fuel-fillups.service", () => ({ listFuelFillups: vi.fn() }));
vi.mock("@/services/invoices.service", () => ({ listInvoices: vi.fn() }));
vi.mock("@/services/payroll.service", () => ({ listPayrollRuns: vi.fn(async () => []) }));
vi.mock("@/services/attendance.service", () => ({ listAttendanceEvents: vi.fn(async () => []) }));
vi.mock("@/services/drivers.service", () => ({ listDrivers: vi.fn() }));
vi.mock("@/services/vehicles.service", () => ({ listVehicles: vi.fn() }));
vi.mock("@/services/actor-names.service", () => ({ listOrgActorNames: vi.fn() }));

import { tripActorLabels, toActorNameMap } from "@/features/trips/lib/actor-labels";
import {
  applyDriverInvoicePrintOverride,
  parseDriverInvoicePrintOverride,
  parseInvoicePrintSettings,
  resolvePrintSupplierName,
} from "@/features/invoices/lib/invoice-print-settings";
import {
  DEFAULT_INVOICE_LIST_FILTERS,
  filterAndSortInvoices,
} from "@/features/invoices/lib/invoice-list-filters";
import { buildDriverInvoicePrintOverride, overrideToIssuerForm } from "@/features/drivers/lib/invoice-issuer-form";
import { combinedTotals, splitByOwner } from "@/features/reports/lib/owner-split";
import { reportFilterSchema } from "@/features/reports/schemas/report";
import { driverImportSchema, vehicleImportSchema } from "@/features/import/schemas/import-schemas";
import {
  driverImportRowToCaptureFields,
  driverToCaptureFields,
  vehicleToCaptureFields,
} from "@/lib/capture/fleet-fields";
import { hasPermission } from "@/lib/permissions";
import { canSeeActorNames } from "@/lib/permissions/actor-names";
import { parseOwnerTag, resolveInvoiceOwner } from "@/lib/owner-tag";
import { TRIP_COLUMNS } from "@/lib/trip-columns";
import { listOrgActorNames } from "@/services/actor-names.service";
import { listDrivers } from "@/services/drivers.service";
import { listFuelFillups } from "@/services/fuel-fillups.service";
import { listInvoices } from "@/services/invoices.service";
import { buildOpsReport, reportToCsvRows } from "@/services/reports.service";
import { listTrips } from "@/services/trips.service";
import { listVehicles } from "@/services/vehicles.service";
import type { Driver, FuelFillup, Invoice, Trip, Vehicle } from "@/types";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

// ---------------------------------------------------------------------------
// Per-driver / per-owner issuer precedence
// ---------------------------------------------------------------------------
const jacobsOrg = {
  name: "Jacobs Org",
  settings: {
    invoice_print: {
      contact: { name: "Demo Yaseen Org Accounts", email: "accounts@demo-yaseen.example.com" },
      banking: { bank: "DEMO-BANK", account_name: "Demo Yaseen Org", account_number: "DEMO-ACC-0001" },
    },
  },
};
const overrides = {
  yaseen: {
    supplier: { name: "Demo Yaseen Transport", address_lines: ["1 Demo Street"] },
    banking: { bank: "DEMO-FNB", account_name: "Demo Yaseen Transport", account_number: "DEMO-ACC-1001" },
  },
  shaheed: {
    supplier: { name: "Demo Shaheed Transport" },
    banking: { bank: "DEMO-ABSA", account_name: "Demo Shaheed Transport", account_number: "DEMO-ACC-2002" },
  },
  freddy: {
    contact: { name: "Demo Mansur Logistics", phone: "+27 00 000 3003" },
    banking: { bank: "DEMO-NEDBANK", account_name: "Demo Mansur Logistics", account_number: "DEMO-ACC-3003" },
  },
};

describe("applyDriverInvoicePrintOverride per driver / owner", () => {
  const base = parseInvoicePrintSettings(jacobsOrg);
  const printed = Object.fromEntries(
    Object.entries(overrides).map(([k, v]) => [k, applyDriverInvoicePrintOverride(base, parseDriverInvoicePrintOverride(v))])
  );

  it.each([
    ["yaseen", "Demo Yaseen Transport", "DEMO-FNB", "DEMO-ACC-1001"],
    ["shaheed", "Demo Shaheed Transport", "DEMO-ABSA", "DEMO-ACC-2002"],
    ["freddy", "Demo Mansur Logistics", "DEMO-NEDBANK", "DEMO-ACC-3003"],
  ])("%s prints its own issuer and banking", (key, issuer, bank, account) => {
    const s = printed[key];
    expect(resolvePrintSupplierName(s, jacobsOrg.name)).toBe(issuer);
    expect(s.banking).toMatchObject({ bank, account_number: account, account_name: issuer });
  });

  it("no cross-bleed between drivers or back to the org banking", () => {
    const accounts = Object.values(printed).map((s) => s.banking?.account_number);
    expect(new Set(accounts).size).toBe(3);
    expect(accounts).not.toContain("DEMO-ACC-0001");
    // Freddy's issuer is a contact block: supplier name follows it, no Yaseen letterhead.
    expect(printed.freddy.supplier?.name).toBe("Demo Mansur Logistics");
    expect(printed.freddy.supplier?.address_lines).toBeUndefined();
    expect(printed.shaheed.contact?.name).toBe("Demo Shaheed Transport");
  });

  it("driver without an override keeps the org issuer", () => {
    const s = applyDriverInvoicePrintOverride(base, null);
    expect(s.banking?.account_number).toBe("DEMO-ACC-0001");
  });

  it("issuer form round-trips and drops empty blocks", () => {
    const form = overrideToIssuerForm(parseDriverInvoicePrintOverride(overrides.yaseen));
    expect(form.account_number).toBe("DEMO-ACC-1001");
    expect(buildDriverInvoicePrintOverride(form)).toEqual({
      supplier: { name: "Demo Yaseen Transport", address_lines: ["1 Demo Street"] },
      banking: { bank: "DEMO-FNB", account_name: "Demo Yaseen Transport", account_number: "DEMO-ACC-1001" },
    });
    expect(buildDriverInvoicePrintOverride(overrideToIssuerForm(null))).toBeNull();
  });

  it("issuer dialog never logs or audits field values", () => {
    const src = read("features/drivers/components/driver-invoice-issuer-dialog.tsx");
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/writeAuditLog/);
    const page = read("features/drivers/components/drivers-page.tsx");
    expect(page).toMatch(/canManage && can\("invoices:manage"\)/);
  });
});

// ---------------------------------------------------------------------------
// Owner filter on invoices
// ---------------------------------------------------------------------------
const inv = (id: string, driverOwner: string | null, owner: string | null = null): Invoice =>
  ({
    id,
    organisation_id: "org",
    company_id: "wcl",
    driver_id: driverOwner === undefined ? null : `d-${id}`,
    trip_company: null,
    period_start: "2026-11-23",
    period_end: "2026-11-29",
    status: "draft",
    currency: "ZAR",
    subtotal: 0,
    total: 0,
    notes: null,
    generated_by: null,
    issued_at: null,
    paid_at: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    owner_tag: owner,
    drivers: driverOwner === null ? null : { id: `d-${id}`, full_name: id, owner_tag: driverOwner },
  }) as Invoice;

describe("filterAndSortInvoices owner filter", () => {
  const list = [inv("y1", "yaseen"), inv("f1", "fadia"), inv("m1", null, "yaseen"), inv("u1", null, null), inv("x1", "fadia", "yaseen")];
  const ids = (owner: "all" | "yaseen" | "fadia") =>
    filterAndSortInvoices(list, { ...DEFAULT_INVOICE_LIST_FILTERS, ownerFilter: owner }).map((i) => i.id).sort();

  it("All keeps everything", () => expect(ids("all")).toEqual(["f1", "m1", "u1", "x1", "y1"]));
  it("Yaseen = driver yaseen or invoice-level yaseen", () => expect(ids("yaseen")).toEqual(["m1", "y1"]));
  it("Fadia: driver owner wins over invoice owner_tag", () => expect(ids("fadia")).toEqual(["f1", "x1"]));
  it("default filters (no ownerFilter) keep everything", () => {
    expect(filterAndSortInvoices(list, { sortOrder: "newest", weekFilter: "all", statusFilter: "all" })).toHaveLength(5);
  });
  it("resolveInvoiceOwner precedence", () => {
    expect(resolveInvoiceOwner({ owner_tag: "yaseen", drivers: { owner_tag: "fadia" } })).toBe("fadia");
    expect(resolveInvoiceOwner({ owner_tag: "yaseen", drivers: null })).toBe("yaseen");
    expect(resolveInvoiceOwner({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Owner-split reports
// ---------------------------------------------------------------------------
const U = { yaseen: "u-yaseen", faadiah: "u-faadiah", clerk: "u-clerk" };
const drivers = [
  { id: "dy", owner_tag: "yaseen" },
  { id: "dp", owner_tag: "yaseen" },
  { id: "ds", owner_tag: "fadia" },
  { id: "dz", owner_tag: null },
] as Driver[];
const vehicles = [
  { id: "vy", owner_tag: "yaseen" },
  { id: "vf", owner_tag: "fadia" },
] as Vehicle[];
const trip = (id: string, driverId: string | null, vehicleId: string | null, createdBy: string, updatedBy = createdBy): Trip =>
  ({
    id,
    organisation_id: "org",
    route_id: "r",
    schedule_id: null,
    company_id: null,
    planned_start: "2026-11-24T06:00:00Z",
    planned_end: null,
    status: "completed",
    generation_key: null,
    notes: null,
    service_locations: null,
    created_by: createdBy,
    updated_by: updatedBy,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    routes: { id: "r", name: "Demo route" },
    trip_assignments: driverId
      ? [{ id: `a-${id}`, driver_id: driverId, vehicle_id: vehicleId, released_at: null }]
      : [],
  }) as unknown as Trip;
const trips = [
  trip("t1", "dy", "vy", U.yaseen),
  trip("t2", "dy", "vy", U.clerk, U.yaseen),
  trip("t3", "ds", "vf", U.faadiah),
  trip("t4", "dz", "vf", U.clerk), // no driver owner -> vehicle owner (fadia)
  trip("t5", null, null, U.faadiah), // unassigned
];
const fill = (id: string, driverId: string | null, vehicleId: string, litres: number, amount: number): FuelFillup =>
  ({
    id,
    organisation_id: "org",
    vehicle_id: vehicleId,
    driver_id: driverId,
    company_id: null,
    filled_at: "2026-11-24T06:00:00Z",
    odometer_km: 1,
    litres,
    unit_price: null,
    total_amount: amount,
    currency: "ZAR",
    station_name: null,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    vehicles: { id: vehicleId, name: vehicleId, registration_number: null },
  }) as FuelFillup;
const PERIOD = { periodStart: "2026-11-23", periodEnd: "2026-11-30" };

function primeMocks() {
  vi.mocked(listTrips).mockResolvedValue(trips);
  vi.mocked(listDrivers).mockResolvedValue(drivers);
  vi.mocked(listVehicles).mockResolvedValue(vehicles);
  vi.mocked(listOrgActorNames).mockResolvedValue([
    { user_id: U.yaseen, display_name: "Demo Yaseen Jacobs" },
    { user_id: U.faadiah, display_name: "Demo Faadiah Jacobs" },
    { user_id: U.clerk, display_name: "Demo Ops Clerk" },
  ]);
  vi.mocked(listFuelFillups).mockResolvedValue([
    fill("f1", "dy", "vy", 40, 900),
    fill("f2", "ds", "vf", 30, 650.5),
    fill("f3", null, "vf", 10, 200),
  ]);
  vi.mocked(listInvoices).mockResolvedValue([
    { ...inv("iy", "yaseen"), status: "issued", total: 1230, period_start: "2026-11-23" },
    { ...inv("is", "fadia"), status: "draft", total: 1380, period_start: "2026-11-23" },
    { ...inv("if", "fadia"), status: "paid", total: 300, period_start: "2026-11-23" },
    { ...inv("im", null, "yaseen"), status: "issued", total: 900, period_start: "2026-11-23" },
    { ...inv("iv", "yaseen"), status: "void", total: 999, period_start: "2026-11-23" },
  ] as Invoice[]);
}

describe("buildOpsReport owner split", () => {
  it("trips: All = Yaseen + Fadia + Unassigned, filters match their slice", async () => {
    primeMocks();
    const all = await buildOpsReport("org", "trips", PERIOD);
    if (all.type !== "trips") throw new Error("trips");
    expect(all.ownerSplit.map((r) => [r.owner, r.count])).toEqual([
      ["yaseen", 2],
      ["fadia", 2],
      ["unassigned", 1],
    ]);
    expect(combinedTotals(all.ownerSplit).count).toBe(all.rows.length);
    for (const owner of ["yaseen", "fadia"] as const) {
      const r = await buildOpsReport("org", "trips", PERIOD, { owner });
      if (r.type !== "trips") throw new Error("trips");
      expect(r.rows.length).toBe(all.ownerSplit.find((s) => s.owner === owner)!.count);
      expect(r.rows.every((row) => row.owner === owner)).toBe(true);
    }
  });

  it("trips CSV has owner, entered_by and updated_by", async () => {
    primeMocks();
    const csv = reportToCsvRows(await buildOpsReport("org", "trips", PERIOD));
    expect(csv.headers).toEqual(["id", "planned_start", "status", "route", "owner", "entered_by", "updated_by"]);
    const t2 = csv.rows.find((r) => r.id === "t2")!;
    expect(t2).toMatchObject({ owner: "Yaseen", entered_by: "Demo Ops Clerk", updated_by: "Demo Yaseen Jacobs" });
    expect(csv.rows.find((r) => r.id === "t5")).toMatchObject({ owner: "Unassigned" });
  });

  it("fuel: split litres / amounts sum to the combined total; filter = slice", async () => {
    primeMocks();
    const all = await buildOpsReport("org", "fuel", PERIOD, { includeFuelAmounts: true });
    if (all.type !== "fuel") throw new Error("fuel");
    const combined = combinedTotals(all.ownerSplit);
    expect(combined.litres).toBe(all.totalLitres);
    expect(combined.amount).toBe(all.totalAmount);
    const y = await buildOpsReport("org", "fuel", PERIOD, { includeFuelAmounts: true, owner: "yaseen" });
    const f = await buildOpsReport("org", "fuel", PERIOD, { includeFuelAmounts: true, owner: "fadia" });
    if (y.type !== "fuel" || f.type !== "fuel") throw new Error("fuel");
    expect(y.totalAmount).toBe(900);
    expect(f.totalAmount).toBe(850.5);
    expect(y.totalAmount + f.totalAmount).toBe(all.totalAmount);
    expect(reportToCsvRows(all, { includeFuelAmounts: true }).headers).toContain("owner");
  });

  it("commercial: void excluded; Yaseen + Fadia = All; owner column in CSV", async () => {
    primeMocks();
    const all = await buildOpsReport("org", "commercial", PERIOD);
    if (all.type !== "commercial") throw new Error("commercial");
    const split = Object.fromEntries(all.ownerSplit.map((r) => [r.owner, r]));
    expect(split.yaseen).toMatchObject({ count: 2, amount: 2130, issued: 2130, paid: 0 });
    expect(split.fadia).toMatchObject({ count: 2, amount: 1680, issued: 0, paid: 300 });
    expect(all.ownerSplit.find((r) => r.owner === "unassigned")).toBeUndefined();
    expect(combinedTotals(all.ownerSplit)).toMatchObject({ count: 4, amount: 3810, issued: all.invoiceIssuedTotal, paid: all.invoicePaidTotal });
    const y = await buildOpsReport("org", "commercial", PERIOD, { owner: "yaseen" });
    if (y.type !== "commercial") throw new Error("commercial");
    expect(y.invoiceIssuedTotal).toBe(split.yaseen.issued);
    expect(y.invoiceCount).toBe(split.yaseen.count);
    const csv = reportToCsvRows(all);
    expect(csv.headers).toContain("owner");
    expect(csv.rows.filter((r) => r.kind === "invoice").map((r) => r.owner).sort()).toEqual(["Fadia", "Fadia", "Yaseen", "Yaseen"]);
  });

  it("splitByOwner always lists Yaseen and Fadia, Unassigned only when non-zero", () => {
    expect(splitByOwner([]).map((r) => r.owner)).toEqual(["yaseen", "fadia"]);
    expect(splitByOwner([{ owner: "unassigned", amount: 1 }]).map((r) => r.owner)).toEqual(["yaseen", "fadia", "unassigned"]);
  });

  it("report filter schema defaults owner to all and rejects unknown owners", () => {
    const base = { report_type: "trips", period_start: "2026-11-23", period_end: "2026-11-30" };
    expect(reportFilterSchema.parse(base).owner).toBe("all");
    expect(reportFilterSchema.safeParse({ ...base, owner: "someone" }).success).toBe(false);
  });

  it("reports page defaults to Split by owner with a Combined view toggle", () => {
    const src = read("features/reports/components/reports-page.tsx");
    expect(src).toMatch(/const \[combined, setCombined\] = useState\(false\)/);
    expect(read("features/reports/components/owner-split-panel.tsx")).toMatch(/Combined view/);
  });
});

// ---------------------------------------------------------------------------
// Owner capture fields + imports
// ---------------------------------------------------------------------------
describe("owner_tag capture + import", () => {
  it("capture fields carry owner_tag ('' clears)", () => {
    expect(driverToCaptureFields({ full_name: "A", owner_tag: "fadia" }).owner_tag).toBe("fadia");
    expect(driverToCaptureFields({ full_name: "A", owner_tag: null }).owner_tag).toBe("");
    expect(vehicleToCaptureFields({ name: "V", owner_tag: "yaseen" }).owner_tag).toBe("yaseen");
    expect(driverToCaptureFields({ full_name: "A" })).not.toHaveProperty("owner_tag");
  });
  it("CSV import validates owner_tag", () => {
    expect(driverImportSchema.parse({ full_name: "Demo Driver", owner_tag: " Fadia " }).owner_tag).toBe("fadia");
    expect(driverImportSchema.parse({ full_name: "Demo Driver", owner_tag: "" }).owner_tag).toBeNull();
    expect(driverImportSchema.safeParse({ full_name: "Demo Driver", owner_tag: "someone" }).success).toBe(false);
    expect(vehicleImportSchema.parse({ name: "CA-DEMO-Y1", owner_tag: "yaseen" }).owner_tag).toBe("yaseen");
    expect(driverImportRowToCaptureFields({ full_name: "Demo Driver", owner_tag: "yaseen" }).owner_tag).toBe("yaseen");
    expect(parseOwnerTag("Unassigned")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Permissions, actor names, revoked columns
// ---------------------------------------------------------------------------
describe("permissions + columns", () => {
  it("dispatcher cannot read print overrides (00089 policy is admin/manager only)", () => {
    const sql = read("supabase/migrations/00089_driver_invoice_print_override.sql");
    const policy = sql.slice(
      sql.indexOf("create policy driver_invoice_print_overrides_select"),
      sql.indexOf("-- No insert/update/delete policies")
    );
    expect(policy).toMatch(/array\['organisation_admin', 'manager'\]/);
    expect(policy).not.toMatch(/dispatcher|supervisor|driver'|company_manager|from public\.invoices/);
    expect(hasPermission("dispatcher", "invoices:manage")).toBe(false);
  });

  it("TRIP_COLUMNS includes updated_by and never the revoked price columns", () => {
    const cols = TRIP_COLUMNS.split(",").map((c) => c.trim());
    expect(cols).toContain("updated_by");
    expect(cols).toContain("created_by");
    expect(cols).not.toContain("manual_unit_price");
    expect(cols).not.toContain("manual_price_area_key");
  });

  it("actor names only for staff roles, never drivers / employees / company managers", () => {
    for (const r of ["organisation_admin", "manager", "dispatcher", "supervisor"] as const) {
      expect(canSeeActorNames(r)).toBe(true);
    }
    for (const r of ["driver", "employee", "company_manager"] as const) {
      expect(canSeeActorNames(r)).toBe(false);
    }
    expect(read("features/trips/components/driver-trips-page.tsx")).not.toMatch(/useOrgActorNames|TripActorLine|list_org_actor_names/);
  });

  it("Entered by / Last edited by labels", () => {
    const names = toActorNameMap([
      { user_id: U.yaseen, display_name: "Demo Yaseen Jacobs" },
      { user_id: U.clerk, display_name: "Demo Ops Clerk" },
    ]);
    expect(tripActorLabels({ created_by: U.clerk, updated_by: U.clerk }, names)).toEqual({ enteredBy: "Demo Ops Clerk", lastEditedBy: null });
    expect(tripActorLabels({ created_by: U.clerk, updated_by: U.yaseen }, names)).toEqual({ enteredBy: "Demo Ops Clerk", lastEditedBy: "Demo Yaseen Jacobs" });
    expect(tripActorLabels({ created_by: null, updated_by: null }, names)).toEqual({ enteredBy: null, lastEditedBy: null });
  });
});
