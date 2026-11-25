import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deploy order is app first, then 00086. Until 00086 is applied the
 * list_fuel_fillup_amounts RPC does not exist; the fuel page and fuel report
 * must still load (amounts read directly while the columns are selectable).
 */

const rpc = vi.fn();
const directResult: { data: unknown; error: unknown } = { data: [], error: null };
const fromCalls: { table: string; select: string; filters: unknown[][] }[] = [];

function chain(table: string) {
  const entry = { table, select: "", filters: [] as unknown[][] };
  fromCalls.push(entry);
  const q = {
    select(cols: string) {
      entry.select = cols;
      return q;
    },
    eq(...a: unknown[]) {
      entry.filters.push(["eq", ...a]);
      return q;
    },
    is(...a: unknown[]) {
      entry.filters.push(["is", ...a]);
      return Promise.resolve(directResult);
    },
  };
  return q;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc, from: chain }),
}));

vi.mock("@/services/tenant-entity.service", () => ({
  listTenantRows: vi.fn(async () => [
    { id: "f1", organisation_id: "org-1", litres: 40, unit_price: 99, total_amount: 99, currency: "X" },
    { id: "f2", organisation_id: "org-1", litres: 10, unit_price: 99, total_amount: 99, currency: "X" },
  ]),
}));

import { listFuelFillups } from "@/services/fuel-fillups.service";

beforeEach(() => {
  rpc.mockReset();
  fromCalls.length = 0;
  directResult.data = [];
  directResult.error = null;
});

describe("listFuelFillups amounts", () => {
  it("uses list_fuel_fillup_amounts when it exists (00086 applied)", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "f1", unit_price: 25, total_amount: 1000, currency: "ZAR" }],
      error: null,
    });
    const rows = await listFuelFillups("org-1", { includeAmounts: true });
    expect(rpc).toHaveBeenCalledWith("list_fuel_fillup_amounts", { p_organisation_id: "org-1" });
    expect(fromCalls).toHaveLength(0);
    expect(rows[0]).toMatchObject({ unit_price: 25, total_amount: 1000, currency: "ZAR" });
    expect(rows[1]).toMatchObject({ unit_price: null, total_amount: null, currency: null });
  });

  it.each([
    { code: "PGRST202", message: "Could not find the function public.list_fuel_fillup_amounts" },
    { code: "42883", message: "function public.list_fuel_fillup_amounts(uuid) does not exist" },
  ])("falls back to direct money columns when the RPC is missing ($code)", async (err) => {
    rpc.mockResolvedValue({ data: null, error: err });
    directResult.data = [{ id: "f2", unit_price: 20, total_amount: 200, currency: "ZAR" }];
    const rows = await listFuelFillups("org-1", { includeAmounts: true });
    expect(fromCalls).toHaveLength(1);
    expect(fromCalls[0].table).toBe("fuel_fillups");
    expect(fromCalls[0].select).toBe("id, unit_price, total_amount, currency");
    expect(fromCalls[0].filters).toEqual([
      ["eq", "organisation_id", "org-1"],
      ["is", "deleted_at", null],
    ]);
    expect(rows[0]).toMatchObject({ id: "f1", unit_price: null, total_amount: null, currency: null });
    expect(rows[1]).toMatchObject({ id: "f2", unit_price: 20, total_amount: 200, currency: "ZAR" });
  });

  it("returns rows without amounts if the fallback is column-revoked (42501)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    directResult.error = { code: "42501", message: "permission denied for table fuel_fillups" };
    const rows = await listFuelFillups("org-1", { includeAmounts: true });
    expect(rows.map((r) => r.total_amount)).toEqual([null, null]);
  });

  it("still throws other RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Not authenticated" } });
    await expect(listFuelFillups("org-1", { includeAmounts: true })).rejects.toMatchObject({
      code: "P0001",
    });
    expect(fromCalls).toHaveLength(0);
  });

  it("never calls the RPC or reads money columns without includeAmounts", async () => {
    const rows = await listFuelFillups("org-1");
    expect(rpc).not.toHaveBeenCalled();
    expect(fromCalls).toHaveLength(0);
    expect(rows.every((r) => r.unit_price === null && r.total_amount === null)).toBe(true);
  });
});
