import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isMissingRpcError,
  waybillBillingProblems,
} from "@/features/trips/lib/waybill-billing-readiness";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

import { getStaffWaybillBillingReadiness } from "@/services/staff-trips.service";

describe("waybillBillingProblems", () => {
  it("returns nothing when ready or when readiness is unknown (RPC not deployed)", () => {
    expect(waybillBillingProblems({ hasTripRate: true, hasBillTo: true }, "Acme", "send")).toEqual([]);
    expect(waybillBillingProblems(null, "Acme", "send")).toEqual([]);
    expect(waybillBillingProblems(undefined, "Acme", "backfill")).toEqual([]);
  });

  it("tells the admin to add a rate for that company (send)", () => {
    const [msg] = waybillBillingProblems({ hasTripRate: false, hasBillTo: true }, "Acme Logistics", "send");
    expect(msg).toContain("No trip rate configured for Acme Logistics");
    expect(msg).toContain("Add a trip rate for Acme Logistics");
    expect(msg).toContain("before sending this waybill to a driver");
  });

  it("uses backfill wording and a generic company fallback", () => {
    const [msg] = waybillBillingProblems({ hasTripRate: false, hasBillTo: true }, null, "backfill");
    expect(msg).toContain("this company");
    expect(msg).toContain("before saving this waybill");
  });

  it("explains a missing bill-to company", () => {
    const problems = waybillBillingProblems({ hasTripRate: false, hasBillTo: false }, "Acme", "send");
    expect(problems).toHaveLength(2);
    expect(problems[1]).toContain("no invoice bill-to company configured");
  });
});

describe("isMissingRpcError", () => {
  it("detects PostgREST / Postgres missing-function errors only", () => {
    expect(isMissingRpcError({ code: "PGRST202", message: "x" })).toBe(true);
    expect(isMissingRpcError({ code: "42883", message: "x" })).toBe(true);
    expect(isMissingRpcError({ message: "Could not find the function public.foo" })).toBe(true);
    expect(isMissingRpcError({ code: "P0001", message: "Not authorised" })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });
});

describe("getStaffWaybillBillingReadiness", () => {
  beforeEach(() => rpc.mockReset());

  it("calls the readiness RPC and maps booleans", async () => {
    rpc.mockResolvedValue({ data: [{ has_trip_rate: false, has_bill_to: true }], error: null });
    await expect(
      getStaffWaybillBillingReadiness("org-1", "co-1", "2026-10-07T08:00:00+02:00")
    ).resolves.toEqual({ hasTripRate: false, hasBillTo: true });
    expect(rpc).toHaveBeenCalledWith("staff_waybill_billing_readiness", {
      p_organisation_id: "org-1",
      p_company_id: "co-1",
      p_planned_start: "2026-10-07T08:00:00+02:00",
    });
  });

  it("fails open (null) before migration 00058 is applied", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(getStaffWaybillBillingReadiness("org-1", "co-1", "x")).resolves.toBeNull();
  });

  it("surfaces other errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Not authorised" } });
    await expect(getStaffWaybillBillingReadiness("org-1", "co-1", "x")).rejects.toMatchObject({ message: "Not authorised" });
  });
});
