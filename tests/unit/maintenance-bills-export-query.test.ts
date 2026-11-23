/**
 * U6: listBillLinesForExport / getExportFilterOptions against a small
 * recording fake of the Supabase query builder.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "a0000000-0000-4000-8000-000000000001";

type Call = { method: string; args: unknown[] };
type Query = { table: string; calls: Call[] };
type Result = { data: unknown[] | null; error: { message: string } | null };

const queries: Query[] = [];
let respond: (q: Query) => Result;

function builder(table: string) {
  const q: Query = { table, calls: [] };
  queries.push(q);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "gte", "lte", "in", "order", "range"]) {
    b[m] = (...args: unknown[]) => {
      q.calls.push({ method: m, args });
      return b;
    };
  }
  b.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve()
      .then(() => respond(q))
      .then(resolve, reject);
  return b;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => builder(t) }),
}));

const calls = (q: Query, method: string) => q.calls.filter((c) => c.method === method).map((c) => c.args);
const rangeOf = (q: Query) => calls(q, "range")[0] as [number, number];

function bill(id: string, date: string, ref: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    bill_date: date,
    invoice_ref: ref,
    status: "approved",
    vat_mode: "inclusive",
    vat_rate: "15.00",
    supplier: { name: "Tyre World", vat_number: null },
    vehicle: [{ id: "v1", name: "Truck 1", registration_number: "CA 1" }],
    ...extra,
  };
}

function line(billId: string, sort: number, extra: Record<string, unknown> = {}) {
  return {
    bill_id: billId,
    description: `line ${sort}`,
    quantity: "1.000",
    unit_amount: "115.00",
    line_excl: "100.00",
    line_vat: "15.00",
    line_incl: "115.00",
    sort_order: sort,
    category: null,
    ...extra,
  };
}

beforeEach(() => {
  queries.length = 0;
  vi.resetModules();
});

async function load() {
  return import("@/features/maintenance/lib/queries");
}

describe("listBillLinesForExport", () => {
  it("filters bills on org, not-deleted and the date range; no vehicle/supplier filter when absent", async () => {
    respond = () => ({ data: [], error: null });
    const { listBillLinesForExport } = await load();
    const r = await listBillLinesForExport(ORG_A, { from: "2026-11-01", to: "2026-11-30" });
    expect(r).toEqual({ ok: true, rows: [] });
    const billsQ = queries.find((q) => q.table === "workshop_bills")!;
    expect(calls(billsQ, "eq")).toEqual([["organisation_id", ORG_A]]);
    expect(calls(billsQ, "is")).toEqual([["deleted_at", null]]);
    expect(calls(billsQ, "gte")).toEqual([["bill_date", "2026-11-01"]]);
    expect(calls(billsQ, "lte")).toEqual([["bill_date", "2026-11-30"]]);
    // No bills -> no line query at all.
    expect(queries.some((q) => q.table === "workshop_bill_lines")).toBe(false);
  });

  it("applies vehicle and supplier filters when given", async () => {
    respond = () => ({ data: [], error: null });
    const { listBillLinesForExport } = await load();
    await listBillLinesForExport(ORG_A, { from: "2026-11-01", to: "2026-11-30", vehicleId: "veh", supplierId: "sup" });
    const billsQ = queries.find((q) => q.table === "workshop_bills")!;
    expect(calls(billsQ, "eq")).toEqual([
      ["organisation_id", ORG_A],
      ["vehicle_id", "veh"],
      ["supplier_id", "sup"],
    ]);
  });

  it("joins lines to bills in bill order then sort_order, with stored figures; skips bills with no lines", async () => {
    respond = (q) => {
      if (q.table === "workshop_bills") {
        return { data: [bill("b1", "2026-11-02", "A"), bill("b2", "2026-11-05", "B"), bill("b3", "2026-11-09", "C")], error: null };
      }
      return {
        data: [
          line("b2", 1, { line_vat: "14.99" }),
          line("b1", 2, { category: { name: "Tyres" } }),
          line("b1", 1),
        ],
        error: null,
      };
    };
    const { listBillLinesForExport } = await load();
    const r = await listBillLinesForExport(ORG_A, { from: "2026-11-01", to: "2026-11-30" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.rows.map((x) => [x.invoice_ref, x.description])).toEqual([
      ["A", "line 1"],
      ["A", "line 2"],
      ["B", "line 1"],
    ]);
    expect(r.rows[1].category_name).toBe("Tyres");
    expect(r.rows[2].line_vat).toBe("14.99");
    expect(r.rows[0]).toMatchObject({
      supplier_name: "Tyre World",
      supplier_vat_number: null,
      vehicle_label: "Truck 1 / CA 1",
      vat_mode: "inclusive",
      vat_rate: "15.00",
      status: "approved",
    });
    const linesQ = queries.find((q) => q.table === "workshop_bill_lines")!;
    expect(calls(linesQ, "eq")).toEqual([["organisation_id", ORG_A]]);
    expect(calls(linesQ, "in")).toEqual([["bill_id", ["b1", "b2", "b3"]]]);
  });

  it("pages bills past 1000 rows and chunks line reads by 200 bill ids", async () => {
    const all = Array.from({ length: 1001 }, (_, i) => bill(`b${i}`, "2026-11-01", String(i).padStart(4, "0")));
    respond = (q) => {
      if (q.table === "workshop_bills") {
        const [from, to] = rangeOf(q);
        return { data: all.slice(from, to + 1), error: null };
      }
      return { data: [], error: null };
    };
    const { listBillLinesForExport } = await load();
    await listBillLinesForExport(ORG_A, { from: "2026-11-01", to: "2026-11-30" });
    const billQs = queries.filter((q) => q.table === "workshop_bills");
    expect(billQs.map(rangeOf)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    const lineQs = queries.filter((q) => q.table === "workshop_bill_lines");
    expect(lineQs).toHaveLength(6);
    expect(lineQs.map((q) => (calls(q, "in")[0][1] as string[]).length)).toEqual([200, 200, 200, 200, 200, 1]);
  });

  it("returns too_many_rows above the line cap", async () => {
    respond = (q) => {
      if (q.table === "workshop_bills") {
        const [from] = rangeOf(q);
        return { data: from === 0 ? [bill("b1", "2026-11-01", "A")] : [], error: null };
      }
      // Always a full page: the cap must stop the loop.
      return { data: Array.from({ length: 1000 }, (_, i) => line("b1", i)), error: null };
    };
    const { listBillLinesForExport, EXPORT_MAX_LINES } = await load();
    const r = await listBillLinesForExport(ORG_A, { from: "2026-11-01", to: "2026-11-30" });
    expect(r).toEqual({ ok: false, error: "too_many_rows" });
    expect(queries.filter((q) => q.table === "workshop_bill_lines").length).toBe(EXPORT_MAX_LINES / 1000 + 1);
  });

  it("throws on a database error", async () => {
    respond = () => ({ data: null, error: { message: "boom" } });
    const { listBillLinesForExport } = await load();
    await expect(listBillLinesForExport(ORG_A, { from: "2026-11-01", to: "2026-11-30" })).rejects.toThrow("boom");
  });
});

describe("getExportFilterOptions", () => {
  it("lists the org's suppliers (inactive labelled) and vehicles", async () => {
    respond = (q) =>
      q.table === "suppliers"
        ? { data: [{ id: "s1", name: "Alpha", active: true }, { id: "s2", name: "Beta", active: false }], error: null }
        : { data: [{ id: "v1", name: "Truck 1", registration_number: "CA 1" }], error: null };
    const { getExportFilterOptions } = await load();
    expect(await getExportFilterOptions(ORG_A)).toEqual({
      suppliers: [
        { value: "s1", label: "Alpha" },
        { value: "s2", label: "Beta (inactive)" },
      ],
      vehicles: [{ value: "v1", label: "Truck 1 / CA 1" }],
    });
    for (const q of queries) {
      expect(calls(q, "eq")).toEqual([["organisation_id", ORG_A]]);
      expect(calls(q, "is")).toEqual([["deleted_at", null]]);
    }
  });
});
