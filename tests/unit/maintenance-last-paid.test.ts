import { describe, expect, it } from "vitest";

import {
  buildLastPaidIndex,
  lastPaidText,
  lastPaidUnit,
  resolveLastPaid,
  type PaidLine,
} from "@/features/maintenance/lib/last-paid";

const line = (o: Partial<PaidLine>): PaidLine => ({
  category_id: "tyres",
  vehicle_id: "v1",
  bill_date: "2026-01-10",
  supplier_name: "Acme",
  quantity: 2,
  line_excl: 2000,
  line_incl: 2300,
  ...o,
});

describe("last paid", () => {
  it("prefers the same vehicle over a newer org-wide bill", () => {
    const index = buildLastPaidIndex([
      line({ vehicle_id: "v1", bill_date: "2026-01-10", supplier_name: "Acme" }),
      line({ vehicle_id: "v2", bill_date: "2026-03-01", supplier_name: "Zed", line_excl: 3000, line_incl: 3450 }),
    ]);
    const own = resolveLastPaid(index, "tyres", "v1");
    expect(own?.scope).toBe("vehicle");
    expect(own?.supplier).toBe("Acme");
    expect(lastPaidUnit(own!, "exclusive")).toBe(1000);
    expect(lastPaidUnit(own!, "inclusive")).toBe(1150);
  });

  it("falls back to the newest org bill, then to nothing", () => {
    const index = buildLastPaidIndex([
      line({ vehicle_id: "v2", bill_date: "2026-02-01", supplier_name: "Old" }),
      line({ vehicle_id: "v3", bill_date: "2026-03-01", supplier_name: "New" }),
    ]);
    const other = resolveLastPaid(index, "tyres", "v1");
    expect(other?.scope).toBe("org");
    expect(other?.supplier).toBe("New");
    expect(resolveLastPaid(index, "brakes", "v1")).toBeNull();
    expect(resolveLastPaid(index, null, "v1")).toBeNull();
  });

  it("formats the label", () => {
    const index = buildLastPaidIndex([line({})]);
    expect(lastPaidText(resolveLastPaid(index, "tyres", "v1"), "exclusive")).toBe(
      "Last paid R1,000.00 (excl. VAT) on 2026-01-10, Acme"
    );
    expect(lastPaidText(null, "exclusive")).toBe("No past bill");
  });
});
