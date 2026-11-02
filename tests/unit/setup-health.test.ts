import { describe, expect, it } from "vitest";

import { computeSetupHealth, sastDate, tripRateOn, type SetupHealthInput } from "@/features/setup-health/lib/setup-health";

const base = (over: Partial<SetupHealthInput> = {}): SetupHealthInput => ({
  settings: { invoice_bill_to_company_id: "wcl" },
  companies: [
    { id: "wcl", name: "WCL Trading CC", status: "active" },
    { id: "a", name: "Alpha", status: "active" },
    { id: "b", name: "Beta", status: "active" },
    { id: "z", name: "Zed (inactive)", status: "inactive" },
  ],
  rateCards: [
    { company_id: "a", line_type: "trip", unit_amount: 400, effective_from: "2026-01-01", effective_to: "2026-09-30" },
    { company_id: "a", line_type: "trip", unit_amount: "450", effective_from: "2026-10-01", effective_to: null },
    { company_id: "b", line_type: "trip", unit_amount: 300, effective_from: "2026-01-01", effective_to: "2026-06-30" },
    { company_id: "b", line_type: "fixed", unit_amount: 999, effective_from: "2026-01-01", effective_to: null },
  ],
  drivers: [
    { id: "d1", full_name: "Dee One", status: "active" },
    { id: "d2", full_name: "Dee Two", status: "active" },
    { id: "d3", full_name: "Old Driver", status: "inactive" },
  ],
  driversWithVehicle: new Set(["d1"]),
  unbilledTrips: [
    { id: "t1", company_id: "a", planned_start: "2026-09-30T23:30:00Z" },
    { id: "t2", company_id: "a", planned_start: "2026-09-15T08:00:00Z" },
    { id: "t3", company_id: "b", planned_start: "2026-10-10T08:00:00Z" },
    { id: "t4", company_id: null, planned_start: "2026-10-10T08:00:00Z" },
  ],
  draftInvoices: [{ total: 1000 }, { total: "250.50" }],
  today: "2026-11-03",
  ...over,
});

describe("tripRateOn", () => {
  it("picks the trip card covering the date and ignores other line types", () => {
    const cards = base().rateCards;
    expect(tripRateOn(cards, "a", "2026-09-30")).toBe(400);
    expect(tripRateOn(cards, "a", "2026-10-01")).toBe(450);
    expect(tripRateOn(cards, "b", "2026-11-03")).toBeNull();
  });
});

describe("sastDate", () => {
  it("shifts UTC late evening into the next SAST day", () => {
    expect(sastDate("2026-09-30T23:30:00Z")).toBe("2026-10-01");
  });
});

describe("computeSetupHealth", () => {
  it("reports bill-to, checklist, unbilled and drafts", () => {
    const h = computeSetupHealth(base());
    expect(h.billTo).toEqual({ companyId: "wcl", name: "WCL Trading CC", explicit: true });
    const [billTo, rates, drivers] = h.checklist;
    expect(billTo.done).toBe(true);
    expect(rates.done).toBe(false);
    expect(rates.missing).toEqual(["Beta"]); // bill-to and inactive excluded
    expect(drivers.missing).toEqual(["Dee Two"]); // inactive driver excluded
    // t1 = 450 (SAST 1 Oct), t2 = 400, t3 unpriced (Beta expired), t4 no company
    expect(h.unbilled).toEqual({ count: 4, value: 850, unpriced: 2 });
    expect(h.drafts).toEqual({ count: 2, total: 1250.5 });
  });

  it("flags a fallback bill-to as not confirmed", () => {
    const h = computeSetupHealth(base({ settings: {} }));
    expect(h.billTo?.explicit).toBe(false);
    expect(h.checklist[0].done).toBe(false);
    expect(h.checklist[0].href).toBe("/settings#invoice-bill-to-card");
  });

  it("handles a brand-new org with nothing set up", () => {
    const h = computeSetupHealth(
      base({ settings: null, companies: [], rateCards: [], drivers: [], driversWithVehicle: new Set(), unbilledTrips: [], draftInvoices: [] })
    );
    expect(h.billTo).toBeNull();
    expect(h.checklist.every((c) => !c.done)).toBe(true);
    expect(h.checklist[1].detail).toBe("No active companies yet");
    expect(h.unbilled).toEqual({ count: 0, value: 0, unpriced: 0 });
    expect(h.drafts.total).toBe(0);
  });
});
