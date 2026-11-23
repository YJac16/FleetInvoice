/**
 * U5: bill form <-> RPC payload mapping. Covers the U4 gap where editing a
 * bill without sending vat_rate let save_workshop_bill fall back to 15.
 */
import { describe, expect, it } from "vitest";

import {
  billToFormValues,
  formValuesToPayload,
  newBillFormValues,
} from "@/features/maintenance/lib/bill-form-values";
import { NONE_OPTION, billFormSchema } from "@/features/maintenance/schemas/workshop-bill";
import type { BillDetail } from "@/features/maintenance/types";

const SUPPLIER = "5a000000-0000-4000-8000-000000000001";
const VEHICLE = "7e000000-0000-4000-8000-000000000001";
const CATEGORY = "ca000000-0000-4000-8000-000000000001";

function bill(overrides: Partial<BillDetail> = {}): BillDetail {
  return {
    id: "b1000000-0000-4000-8000-000000000001",
    supplier_id: SUPPLIER,
    supplier_name: "Tyre World",
    vehicle_id: null,
    vehicle_label: null,
    bill_date: "2026-11-20",
    invoice_ref: "INV-1",
    vat_mode: "exclusive",
    vat_rate: 15,
    subtotal_excl: 100,
    vat_amount: 15,
    total_incl: 115,
    status: "draft",
    odometer_km: null,
    notes: null,
    has_attachment: false,
    attachment_mime: null,
    attachment_size: null,
    lines: [
      {
        id: "l1",
        category_id: null,
        category_name: null,
        description: "Tyre",
        quantity: 1,
        unit_amount: 100,
        vat_applicable: true,
        line_excl: 100,
        line_vat: 15,
        line_incl: 115,
        sort_order: 1,
      },
    ],
    ...overrides,
  };
}

function roundTrip(b: BillDetail) {
  const parsed = billFormSchema.parse(billToFormValues(b));
  return formValuesToPayload(parsed);
}

describe("vat_rate is never left for the RPC to default", () => {
  it.each([0, 7.5, 15, 14.25])("keeps a stored rate of %s on edit", (rate) => {
    const payload = roundTrip(bill({ vat_rate: rate }));
    expect(payload.vat_rate).toBe(rate);
    expect(typeof payload.vat_rate).toBe("number");
  });

  it("always includes vat_rate in the payload", () => {
    const payload = roundTrip(bill({ vat_rate: 0 }));
    expect(Object.prototype.hasOwnProperty.call(payload, "vat_rate")).toBe(true);
    expect(JSON.parse(JSON.stringify(payload)).vat_rate).toBe(0);
  });

  it("rejects a blank or out-of-range rate instead of sending it", () => {
    const values = billToFormValues(bill());
    expect(billFormSchema.safeParse({ ...values, vat_rate: "" }).success).toBe(false);
    expect(billFormSchema.safeParse({ ...values, vat_rate: "101" }).success).toBe(false);
    expect(billFormSchema.safeParse({ ...values, vat_rate: "-1" }).success).toBe(false);
  });

  it("starts a new bill at 15% exclusive", () => {
    const values = newBillFormValues("2026-11-23");
    expect(values.vat_rate).toBe("15");
    expect(values.vat_mode).toBe("exclusive");
    expect(values.bill_date).toBe("2026-11-23");
  });
});

describe("odometer is optional and stored only as typed", () => {
  it("sends null when blank", () => {
    expect(roundTrip(bill({ odometer_km: null })).odometer_km).toBeNull();
  });

  it("keeps a typed reading", () => {
    expect(billToFormValues(bill({ odometer_km: 200000 })).odometer_km).toBe("200000");
    expect(roundTrip(bill({ odometer_km: 200000 })).odometer_km).toBe(200000);
  });

  it("rejects decimals and negatives", () => {
    const values = billToFormValues(bill());
    expect(billFormSchema.safeParse({ ...values, odometer_km: "12.5" }).success).toBe(false);
    expect(billFormSchema.safeParse({ ...values, odometer_km: "-5" }).success).toBe(false);
  });
});

describe("other fields", () => {
  it("maps 'none' selections to null and keeps real ids", () => {
    const b = bill({
      vehicle_id: VEHICLE,
      lines: [{ ...bill().lines[0]!, category_id: CATEGORY }, { ...bill().lines[0]!, id: "l2", category_id: null, sort_order: 2 }],
    });
    const payload = roundTrip(b);
    expect(payload.vehicle_id).toBe(VEHICLE);
    expect(payload.lines.map((l) => l.category_id)).toEqual([CATEGORY, null]);

    const noVehicle = roundTrip(bill({ vehicle_id: null }));
    expect(noVehicle.vehicle_id).toBeNull();
    expect(billToFormValues(bill()).vehicle_id).toBe(NONE_OPTION);
  });

  it("keeps the VAT mode, line order and non-VAT lines", () => {
    const b = bill({
      vat_mode: "inclusive",
      lines: [
        { ...bill().lines[0]!, id: "b", description: "Second", sort_order: 2, vat_applicable: false },
        { ...bill().lines[0]!, id: "a", description: "First", sort_order: 1, quantity: 2.5, unit_amount: 19.99 },
      ],
    });
    const payload = roundTrip(b);
    expect(payload.vat_mode).toBe("inclusive");
    expect(payload.lines.map((l) => [l.description, l.sort_order, l.vat_applicable])).toEqual([
      ["First", 1, true],
      ["Second", 2, false],
    ]);
    expect(payload.lines[0]).toMatchObject({ quantity: 2.5, unit_amount: 19.99 });
  });

  it("never sends client totals", () => {
    const payload = roundTrip(bill()) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("subtotal_excl");
    expect(payload).not.toHaveProperty("vat_amount");
    expect(payload).not.toHaveProperty("total_incl");
    expect(payload.lines as unknown[]).toSatisfy((lines: Array<Record<string, unknown>>) =>
      lines.every((l) => !("line_excl" in l) && !("line_vat" in l) && !("line_incl" in l))
    );
  });

  it("trims text and sends blank notes as null", () => {
    const values = { ...billToFormValues(bill()), invoice_ref: "  INV-9 ", notes: "   " };
    const payload = formValuesToPayload(billFormSchema.parse(values));
    expect(payload.invoice_ref).toBe("INV-9");
    expect(payload.notes).toBeNull();
  });
});
