import { describe, expect, it } from "vitest";

import { addMonths, computeDue, kmPerDay } from "@/features/maintenance/lib/forecast";

describe("km/day gates", () => {
  it("needs 2+ readings", () => {
    expect(kmPerDay([{ date: "2026-01-01", km: 1000 }]).ok).toBe(false);
  });
  it("needs 30+ days apart", () => {
    expect(kmPerDay([{ date: "2026-01-01", km: 1000 }, { date: "2026-01-30", km: 5000 }]).ok).toBe(false);
  });
  it("needs 1,000+ km apart", () => {
    expect(kmPerDay([{ date: "2026-01-01", km: 1000 }, { date: "2026-03-01", km: 1999 }]).ok).toBe(false);
  });
  it("passes at exactly 30 days and 1,000 km", () => {
    const r = kmPerDay([{ date: "2026-01-31", km: 2000 }, { date: "2026-01-01", km: 1000 }]);
    expect(r).toEqual({ ok: true, kmPerDay: 1000 / 30 });
  });
});

describe("due estimate", () => {
  const base = {
    today: "2026-06-01",
    intervalKm: 10000,
    intervalMonths: null,
    lastBillDate: "2026-01-15",
    lastOdometerKm: 50000,
    currentKm: 52000,
    readings: [] as Array<{ date: string; km: number }>,
  };

  it("clamps month-end dates", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("date from months", () => {
    const d = computeDue({ ...base, intervalKm: null, intervalMonths: 6 });
    expect(d.dueDate).toBe("2026-07-15");
    expect(d.dateBasis).toBe("months");
    expect(d.overdue).toBe(false);
  });

  it("km due without a date when readings fail the gates", () => {
    const d = computeDue(base);
    expect(d.dueKm).toBe(60000);
    expect(d.dueDate).toBeNull();
    expect(d.hasEstimate).toBe(true);
  });

  it("km date once readings pass the gates", () => {
    const d = computeDue({
      ...base,
      readings: [{ date: "2026-01-15", km: 50000 }, { date: "2026-03-16", km: 52000 }],
      currentKm: 52000,
    });
    // 2000 km over 60 days -> remaining 8000 km = 240 days after 2026-03-16
    expect(d.dateBasis).toBe("km");
    expect(d.dueDate).toBe("2026-11-11");
  });

  it("no odometer on the last bill -> no km, months still work", () => {
    const d = computeDue({ ...base, lastOdometerKm: null, intervalMonths: 3 });
    expect(d.dueKm).toBeNull();
    expect(d.dueDate).toBe("2026-04-15");
    expect(d.overdue).toBe(true);
  });

  it("nothing to estimate", () => {
    const d = computeDue({ ...base, lastOdometerKm: null });
    expect(d.hasEstimate).toBe(false);
  });
});
